from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, status

from app.dependencies import CurrentUser, DatabaseDep, require_owned
from app.errors import AppError
from app.schemas import GenerationRequest, QuestionCreate, QuestionUpdate, RenameRequest
from app.services.ai import gemini_service, run_question_generation
from app.services.parsing import extract_text, parse_questions, validate_imported_questions
from app.services.plans import consume_ai_quota, get_plan, refund_ai_quota
from app.utils import parse_object_id, serialize, utc_now


router = APIRouter(tags=["Question Banks"])


@router.post("/question-banks/import", status_code=status.HTTP_201_CREATED)
async def import_question_bank(
    user: CurrentUser,
    db: DatabaseDep,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
) -> dict:
    filename = file.filename or "questions.txt"
    if Path(filename).suffix.lower() not in {".pdf", ".docx", ".txt"}:
        raise AppError(
            code="UNSUPPORTED_FILE_EXTENSION",
            message="Import câu hỏi hiện hỗ trợ PDF, DOCX và TXT.",
            status_code=415,
            resolution="Chuyển file sang một trong ba định dạng được hỗ trợ.",
        )
    content = await file.read()
    text = extract_text(content, filename)
    try:
        parsed = validate_imported_questions(parse_questions(text))
        question_payloads = [question.model_dump() for question in parsed]
        provider = "rule-parser"
    except AppError:
        generated = await gemini_service.parse_complex_questions(text)
        question_payloads = [question.model_dump(exclude={"evidence"}) for question in generated]
        provider = "gemini-fallback"
    now = utc_now()
    bank = {
        "ownerId": user["_id"],
        "source": {"type": "QUESTION_IMPORT", "documentId": None, "originalDocumentName": filename},
        "name": (name or Path(filename).stem).strip()[:160],
        "generationConfig": {"mode": "IMPORT", "parser": provider},
        "questionCount": len(question_payloads),
        "status": "READY",
        "createdAt": now,
        "updatedAt": now,
    }
    bank["_id"] = (await db.question_banks.insert_one(bank)).inserted_id
    documents = [
        {
            "questionBankId": bank["_id"],
            **question,
            "origin": {"type": "IMPORTED"},
            "source": {"pages": [], "evidence": ""},
            "createdAt": now,
            "updatedAt": now,
        }
        for question in question_payloads
    ]
    if documents:
        await db.questions.insert_many(documents)
    return serialize(bank)


@router.post("/question-banks/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_question_bank(
    payload: GenerationRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser,
    db: DatabaseDep,
) -> dict:
    document_id = parse_object_id(payload.documentId, "documentId")
    document = await require_owned(db.documents, document_id, user["_id"], "userId", "document")
    plan = await get_plan(db, user.get("currentPlan", "FREE"))
    if payload.mode == "ADVANCED" and not plan["limits"]["advancedGeneration"]:
        raise AppError(
            code="ADVANCED_GENERATION_REQUIRES_UPGRADE",
            message="Gói hiện tại chưa hỗ trợ cấu hình AI nâng cao.",
            status_code=403,
            resolution="Dùng chế độ BASIC hoặc nâng cấp lên Pro/Max.",
        )
    # Free users can use the safe BASIC preset only; client-supplied advanced
    # knobs must not become a back door to larger generations.
    if not plan["limits"]["advancedGeneration"]:
        payload = GenerationRequest(documentId=payload.documentId)
    bank_id = ObjectId()
    job_id = ObjectId()
    quota = await consume_ai_quota(db, user, job_id)
    now = utc_now()
    bank = {
        "_id": bank_id,
        "ownerId": user["_id"],
        "source": {
            "type": "DOCUMENT_AI",
            "documentId": document_id,
            "originalDocumentName": document["originalFileName"],
        },
        "name": f"{document['name']} - Bộ câu hỏi",
        "generationConfig": payload.model_dump(exclude={"documentId"}),
        "questionCount": 0,
        "status": "PROCESSING",
        "createdAt": now,
        "updatedAt": now,
    }
    job = {
        "_id": job_id,
        "userId": user["_id"],
        "documentId": document_id,
        "questionBankId": bank_id,
        "type": "GENERATE_QUESTIONS",
        "status": "PENDING",
        "progress": {"current": 0, "total": payload.questionCount, "percent": 0},
        "config": payload.model_dump(exclude={"documentId"}),
        "provider": "gemini" if gemini_service.available else "local-fallback",
        "quota": {
            "date": quota["date"],
            "reservationId": job_id,
            "refunded": False,
        },
        "error": None,
        "createdAt": now,
        "completedAt": None,
    }
    try:
        await db.question_banks.insert_one(bank)
        await db.ai_jobs.insert_one(job)
    except Exception:
        await db.question_banks.delete_one({"_id": bank_id})
        await db.ai_jobs.delete_one({"_id": job_id})
        await refund_ai_quota(db, user["_id"], quota["date"], job_id)
        raise
    background_tasks.add_task(run_question_generation, db, job_id, bank_id, document_id, payload)
    return serialize({"jobId": job_id, "questionBankId": bank_id, "status": "PENDING"})


@router.get("/question-banks")
async def list_question_banks(user: CurrentUser, db: DatabaseDep) -> list[dict]:
    items = await db.question_banks.find({"ownerId": user["_id"]}).sort("createdAt", -1).to_list(None)
    return serialize(items)


@router.get("/question-banks/{bank_id}")
async def get_question_bank(bank_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    bank = await require_owned(
        db.question_banks, parse_object_id(bank_id, "questionBankId"), user["_id"], "ownerId", "question bank"
    )
    return serialize(bank)


@router.patch("/question-banks/{bank_id}")
async def rename_question_bank(
    bank_id: str, payload: RenameRequest, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(bank_id, "questionBankId")
    await require_owned(db.question_banks, object_id, user["_id"], "ownerId", "question bank")
    await db.question_banks.update_one(
        {"_id": object_id}, {"$set": {"name": payload.name.strip(), "updatedAt": utc_now()}}
    )
    return serialize(await db.question_banks.find_one({"_id": object_id}))


@router.delete("/question-banks/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question_bank(bank_id: str, user: CurrentUser, db: DatabaseDep) -> None:
    object_id = parse_object_id(bank_id, "questionBankId")
    await require_owned(db.question_banks, object_id, user["_id"], "ownerId", "question bank")
    linked_quiz = await db.quizzes.find_one({"questionBankId": object_id})
    if linked_quiz:
        raise AppError(
            code="QUESTION_BANK_IN_USE",
            message="Bộ câu hỏi đang được dùng bởi ít nhất một quiz.",
            status_code=409,
            resolution="Xóa các quiz liên quan trước rồi thử lại.",
        )
    await db.questions.delete_many({"questionBankId": object_id})
    await db.question_banks.delete_one({"_id": object_id})


@router.get("/question-banks/{bank_id}/questions")
async def list_questions(bank_id: str, user: CurrentUser, db: DatabaseDep) -> list[dict]:
    object_id = parse_object_id(bank_id, "questionBankId")
    await require_owned(db.question_banks, object_id, user["_id"], "ownerId", "question bank")
    return serialize(await db.questions.find({"questionBankId": object_id}).sort("createdAt", 1).to_list(None))


@router.post("/question-banks/{bank_id}/questions", status_code=status.HTTP_201_CREATED)
async def create_question(
    bank_id: str, payload: QuestionCreate, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(bank_id, "questionBankId")
    await require_owned(db.question_banks, object_id, user["_id"], "ownerId", "question bank")
    now = utc_now()
    question = {
        "questionBankId": object_id,
        **payload.model_dump(),
        "origin": {"type": "MANUAL"},
        "source": {"pages": [], "evidence": ""},
        "createdAt": now,
        "updatedAt": now,
    }
    question["_id"] = (await db.questions.insert_one(question)).inserted_id
    count = await db.questions.count_documents({"questionBankId": object_id})
    await db.question_banks.update_one(
        {"_id": object_id}, {"$set": {"questionCount": count, "updatedAt": now}}
    )
    return serialize(question)


@router.patch("/questions/{question_id}")
async def update_question(
    question_id: str, payload: QuestionUpdate, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(question_id, "questionId")
    question = await db.questions.find_one({"_id": object_id})
    if not question:
        raise AppError("QUESTION_NOT_FOUND", "Không tìm thấy câu hỏi.", 404)
    await require_owned(db.question_banks, question["questionBankId"], user["_id"], "ownerId", "question bank")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        merged = {
            field: updates.get(field, question.get(field))
            for field in QuestionCreate.model_fields
        }
        validated = QuestionCreate.model_validate(merged)
        updates = {
            field: validated.model_dump()[field]
            for field in updates
        }
        updates["updatedAt"] = utc_now()
        await db.questions.update_one({"_id": object_id}, {"$set": updates})
    return serialize(await db.questions.find_one({"_id": object_id}))


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(question_id: str, user: CurrentUser, db: DatabaseDep) -> None:
    object_id = parse_object_id(question_id, "questionId")
    question = await db.questions.find_one({"_id": object_id})
    if not question:
        raise AppError("QUESTION_NOT_FOUND", "Không tìm thấy câu hỏi.", 404)
    await require_owned(db.question_banks, question["questionBankId"], user["_id"], "ownerId", "question bank")
    await db.questions.delete_one({"_id": object_id})
    count = await db.questions.count_documents({"questionBankId": question["questionBankId"]})
    await db.question_banks.update_one(
        {"_id": question["questionBankId"]},
        {"$set": {"questionCount": count, "updatedAt": utc_now()}},
    )


@router.get("/ai-jobs/{job_id}")
async def get_ai_job(job_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    job = await db.ai_jobs.find_one({"_id": parse_object_id(job_id, "jobId"), "userId": user["_id"]})
    if not job:
        raise AppError("AI_JOB_NOT_FOUND", "Không tìm thấy AI job.", 404)
    return serialize(job)
