import random
import secrets
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Query, status

from app.dependencies import CurrentUser, DatabaseDep, require_owned
from app.errors import AppError
from app.schemas import AttemptSubmit, QuizCreate, QuizUpdate
from app.utils import parse_object_id, serialize, utc_now


router = APIRouter(tags=["Quizzes"])


def _share_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "TST-" + "".join(secrets.choice(alphabet) for _ in range(5))


def _can_access(quiz: dict, user_id: ObjectId) -> bool:
    return quiz["ownerId"] == user_id or quiz.get("visibility") in {"PUBLIC", "UNLISTED"}


@router.post("/quizzes", status_code=status.HTTP_201_CREATED)
async def create_quiz(payload: QuizCreate, user: CurrentUser, db: DatabaseDep) -> dict:
    bank_id = parse_object_id(payload.questionBankId, "questionBankId")
    bank = await require_owned(db.question_banks, bank_id, user["_id"], "ownerId", "question bank")
    if bank.get("status") != "READY" or bank.get("questionCount", 0) < payload.config.questionCount:
        raise AppError(
            code="INSUFFICIENT_QUESTIONS",
            message="Bộ câu hỏi chưa sẵn sàng hoặc không đủ số câu để tạo quiz.",
            status_code=409,
            resolution=f"Chọn tối đa {bank.get('questionCount', 0)} câu hoặc đợi AI job hoàn tất.",
        )
    now = utc_now()
    quiz = {
        "ownerId": user["_id"],
        "questionBankId": bank_id,
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "visibility": payload.visibility.value,
        "shareCode": _share_code(),
        "config": payload.config.model_dump(),
        "stats": {"attemptCount": 0, "participantCount": 0, "averageScore": 0, "highestScore": 0},
        "createdAt": now,
        "updatedAt": now,
    }
    quiz["_id"] = (await db.quizzes.insert_one(quiz)).inserted_id
    return serialize(quiz)


@router.get("/quizzes")
async def list_quizzes(user: CurrentUser, db: DatabaseDep) -> list[dict]:
    return serialize(await db.quizzes.find({"ownerId": user["_id"]}).sort("createdAt", -1).to_list(None))


@router.get("/quizzes/share/{share_code}")
async def get_shared_quiz(share_code: str, db: DatabaseDep) -> dict:
    quiz = await db.quizzes.find_one({"shareCode": share_code.upper(), "visibility": {"$ne": "PRIVATE"}})
    if not quiz:
        raise AppError(
            code="SHARED_QUIZ_NOT_FOUND",
            message="Mã chia sẻ không tồn tại hoặc quiz đang ở chế độ riêng tư.",
            status_code=404,
            resolution="Kiểm tra lại mã TST-xxxxx với chủ quiz.",
        )
    owner = await db.users.find_one({"_id": quiz["ownerId"]}, {"username": 1})
    response = serialize(quiz)
    response["ownerUsername"] = (owner or {}).get("username", "Testora user")
    return response


@router.get("/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    quiz = await db.quizzes.find_one({"_id": parse_object_id(quiz_id, "quizId")})
    if not quiz or not _can_access(quiz, user["_id"]):
        raise AppError("QUIZ_NOT_FOUND", "Không tìm thấy quiz hoặc bạn không có quyền truy cập.", 404)
    return serialize(quiz)


@router.patch("/quizzes/{quiz_id}")
async def update_quiz(
    quiz_id: str, payload: QuizUpdate, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(quiz_id, "quizId")
    quiz = await require_owned(db.quizzes, object_id, user["_id"], "ownerId", "quiz")
    updates = payload.model_dump(exclude_none=True)
    if "visibility" in updates:
        updates["visibility"] = updates["visibility"].value
    if "config" in updates:
        bank = await db.question_banks.find_one({"_id": quiz["questionBankId"]})
        if updates["config"]["questionCount"] > (bank or {}).get("questionCount", 0):
            raise AppError("INSUFFICIENT_QUESTIONS", "Bộ câu hỏi không đủ số câu đã chọn.", 409)
    updates["updatedAt"] = utc_now()
    await db.quizzes.update_one({"_id": object_id}, {"$set": updates})
    return serialize(await db.quizzes.find_one({"_id": object_id}))


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(quiz_id: str, user: CurrentUser, db: DatabaseDep) -> None:
    object_id = parse_object_id(quiz_id, "quizId")
    await require_owned(db.quizzes, object_id, user["_id"], "ownerId", "quiz")
    await db.quiz_attempts.delete_many({"quizId": object_id})
    await db.quizzes.delete_one({"_id": object_id})


@router.post("/quizzes/{quiz_id}/start", status_code=status.HTTP_201_CREATED)
async def start_quiz(quiz_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    object_id = parse_object_id(quiz_id, "quizId")
    quiz = await db.quizzes.find_one({"_id": object_id})
    if not quiz or not _can_access(quiz, user["_id"]):
        raise AppError("QUIZ_NOT_FOUND", "Không tìm thấy quiz hoặc bạn không có quyền làm quiz.", 404)
    questions = await db.questions.find({"questionBankId": quiz["questionBankId"]}).to_list(None)
    if quiz["config"].get("shuffleQuestions", True):
        random.SystemRandom().shuffle(questions)
    questions = questions[: quiz["config"]["questionCount"]]
    if not questions:
        raise AppError("QUIZ_HAS_NO_QUESTIONS", "Quiz này chưa có câu hỏi để bắt đầu.", 409)
    attempt_number = await db.quiz_attempts.count_documents({"quizId": object_id, "userId": user["_id"]}) + 1
    now = utc_now()
    attempt = {
        "quizId": object_id,
        "userId": user["_id"],
        "attemptNumber": attempt_number,
        "status": "IN_PROGRESS",
        "questionIds": [question["_id"] for question in questions],
        "startedAt": now,
        "submittedAt": None,
        "durationSeconds": None,
        "answers": [],
        "result": None,
        "createdAt": now,
    }
    attempt["_id"] = (await db.quiz_attempts.insert_one(attempt)).inserted_id
    public_questions = []
    for question in questions:
        options = [dict(option) for option in question["options"]]
        if quiz["config"].get("shuffleOptions", True):
            random.SystemRandom().shuffle(options)
        public_questions.append(
            {
                "_id": question["_id"],
                "content": question["content"],
                "options": options,
                "difficulty": question.get("difficulty"),
                "questionType": question.get("questionType"),
                "topic": question.get("topic"),
            }
        )
    return serialize(
        {
            "attemptId": attempt["_id"],
            "quiz": {
                "_id": quiz["_id"],
                "title": quiz["title"],
                "durationMinutes": quiz["config"]["durationMinutes"],
            },
            "questions": public_questions,
            "startedAt": now,
        }
    )


async def _refresh_quiz_stats(db: Any, quiz_id: ObjectId) -> None:
    attempts = await db.quiz_attempts.find({"quizId": quiz_id, "status": "SUBMITTED"}).to_list(None)
    if not attempts:
        return
    scores = [attempt["result"]["score"] for attempt in attempts]
    participants = {attempt["userId"] for attempt in attempts}
    await db.quizzes.update_one(
        {"_id": quiz_id},
        {
            "$set": {
                "stats": {
                    "attemptCount": len(attempts),
                    "participantCount": len(participants),
                    "averageScore": round(sum(scores) / len(scores), 2),
                    "highestScore": max(scores),
                },
                "updatedAt": utc_now(),
            }
        },
    )


@router.post("/quiz-attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: str, payload: AttemptSubmit, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(attempt_id, "attemptId")
    attempt = await db.quiz_attempts.find_one({"_id": object_id, "userId": user["_id"]})
    if not attempt:
        raise AppError("ATTEMPT_NOT_FOUND", "Không tìm thấy lượt làm quiz.", 404)
    if attempt.get("status") != "IN_PROGRESS":
        raise AppError(
            "ATTEMPT_ALREADY_SUBMITTED",
            "Lượt làm này đã được nộp và không thể nộp lần nữa.",
            409,
        )
    question_ids = attempt["questionIds"]
    question_map = {
        item["_id"]: item for item in await db.questions.find({"_id": {"$in": question_ids}}).to_list(None)
    }
    submitted_map = {parse_object_id(answer.questionId, "questionId"): answer for answer in payload.answers}
    graded_answers = []
    wrong_ids = []
    correct = 0
    unanswered = 0
    for question_id in question_ids:
        question = question_map.get(question_id)
        if not question:
            continue
        submitted = submitted_map.get(question_id)
        selected = submitted.selectedAnswer if submitted else None
        is_correct = selected == question["correctAnswer"]
        if not selected:
            unanswered += 1
        elif is_correct:
            correct += 1
        else:
            wrong_ids.append(question_id)
        graded_answers.append(
            {
                "questionId": question_id,
                "selectedAnswer": selected,
                "isCorrect": is_correct,
                "timeSpentSeconds": submitted.timeSpentSeconds if submitted else 0,
            }
        )
    total = len(question_ids)
    wrong = total - correct - unanswered
    submitted_at = utc_now()
    duration = max(0, int((submitted_at - attempt["startedAt"]).total_seconds()))
    result = {
        "correct": correct,
        "wrong": wrong,
        "unanswered": unanswered,
        "score": round(correct / total * 10, 2) if total else 0,
        "wrongQuestionIds": wrong_ids,
    }
    update = await db.quiz_attempts.update_one(
        {"_id": object_id, "status": "IN_PROGRESS"},
        {
            "$set": {
                "status": "SUBMITTED",
                "submittedAt": submitted_at,
                "durationSeconds": duration,
                "answers": graded_answers,
                "result": result,
            }
        },
    )
    if update.modified_count != 1:
        raise AppError("ATTEMPT_ALREADY_SUBMITTED", "Lượt làm đã được nộp bởi một yêu cầu khác.", 409)
    await _refresh_quiz_stats(db, attempt["quizId"])
    return await _attempt_result(db, object_id, user["_id"])


async def _attempt_result(db: Any, attempt_id: ObjectId, user_id: ObjectId) -> dict:
    attempt = await db.quiz_attempts.find_one({"_id": attempt_id, "userId": user_id})
    if not attempt or attempt.get("status") != "SUBMITTED":
        raise AppError("RESULT_NOT_READY", "Kết quả chưa sẵn sàng.", 409)
    quiz = await db.quizzes.find_one({"_id": attempt["quizId"]})
    questions = {
        item["_id"]: item
        for item in await db.questions.find({"_id": {"$in": attempt["questionIds"]}}).to_list(None)
    }
    answers = {item["questionId"]: item for item in attempt["answers"]}
    review = []
    for question_id in attempt["questionIds"]:
        question = questions.get(question_id)
        if not question:
            continue
        answer = answers.get(question_id, {})
        review.append(
            {
                "questionId": question_id,
                "content": question["content"],
                "options": question["options"],
                "selectedAnswer": answer.get("selectedAnswer"),
                "correctAnswer": question["correctAnswer"],
                "isCorrect": answer.get("isCorrect", False),
                "explanation": question["explanation"],
                "topic": question.get("topic"),
            }
        )
    return serialize(
        {
            "attemptId": attempt["_id"],
            "quiz": {"_id": quiz["_id"], "title": quiz["title"]} if quiz else None,
            "attemptNumber": attempt["attemptNumber"],
            "startedAt": attempt["startedAt"],
            "submittedAt": attempt["submittedAt"],
            "durationSeconds": attempt["durationSeconds"],
            "result": attempt["result"],
            "review": review,
        }
    )


@router.get("/quiz-attempts/{attempt_id}/result")
async def get_attempt_result(attempt_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    return await _attempt_result(db, parse_object_id(attempt_id, "attemptId"), user["_id"])


@router.get("/quizzes/{quiz_id}/attempts")
async def my_attempts(quiz_id: str, user: CurrentUser, db: DatabaseDep) -> list[dict]:
    object_id = parse_object_id(quiz_id, "quizId")
    return serialize(
        await db.quiz_attempts.find({"quizId": object_id, "userId": user["_id"]})
        .sort("attemptNumber", -1)
        .to_list(None)
    )


@router.get("/quizzes/{quiz_id}/my-wrong-questions")
async def my_wrong_questions(
    quiz_id: str,
    user: CurrentUser,
    db: DatabaseDep,
    attemptId: str | None = Query(default=None),
) -> dict:
    quiz_object_id = parse_object_id(quiz_id, "quizId")
    query: dict[str, Any] = {"quizId": quiz_object_id, "userId": user["_id"], "status": "SUBMITTED"}
    if attemptId:
        query["_id"] = parse_object_id(attemptId, "attemptId")
    attempt = await db.quiz_attempts.find(query).sort("submittedAt", -1).limit(1).to_list(None)
    if not attempt:
        return {"attemptId": None, "questions": []}
    selected = attempt[0]
    ids = selected["result"].get("wrongQuestionIds", [])
    questions = await db.questions.find({"_id": {"$in": ids}}).to_list(None)
    return serialize({"attemptId": selected["_id"], "questions": questions})


@router.get("/quizzes/{quiz_id}/leaderboard")
async def leaderboard(quiz_id: str, user: CurrentUser, db: DatabaseDep) -> list[dict]:
    object_id = parse_object_id(quiz_id, "quizId")
    quiz = await db.quizzes.find_one({"_id": object_id})
    if not quiz or not _can_access(quiz, user["_id"]):
        raise AppError("QUIZ_NOT_FOUND", "Không tìm thấy quiz.", 404)
    if not quiz["config"].get("leaderboardEnabled", True):
        raise AppError("LEADERBOARD_DISABLED", "Chủ quiz đã tắt bảng xếp hạng.", 403)
    attempts = await db.quiz_attempts.find({"quizId": object_id, "status": "SUBMITTED"}).to_list(None)
    best: dict[ObjectId, dict] = {}
    for attempt in attempts:
        current = best.get(attempt["userId"])
        candidate_key = (-attempt["result"]["score"], attempt["durationSeconds"], attempt["submittedAt"])
        if current is None:
            best[attempt["userId"]] = attempt
        else:
            current_key = (-current["result"]["score"], current["durationSeconds"], current["submittedAt"])
            if candidate_key < current_key:
                best[attempt["userId"]] = attempt
    ordered = sorted(
        best.values(),
        key=lambda item: (-item["result"]["score"], item["durationSeconds"], item["submittedAt"]),
    )
    users = {
        item["_id"]: item["username"]
        for item in await db.users.find({"_id": {"$in": list(best)}}).to_list(None)
    }
    counts: dict[ObjectId, int] = {}
    for attempt in attempts:
        counts[attempt["userId"]] = counts.get(attempt["userId"], 0) + 1
    return serialize(
        [
            {
                "rank": index + 1,
                "username": users.get(attempt["userId"], "Người học"),
                "score": attempt["result"]["score"],
                "correct": attempt["result"]["correct"],
                "total": len(attempt["questionIds"]),
                "completionTimeSeconds": attempt["durationSeconds"],
                "attemptCount": counts[attempt["userId"]],
                "submittedAt": attempt["submittedAt"],
            }
            for index, attempt in enumerate(ordered[:100])
        ]
    )
