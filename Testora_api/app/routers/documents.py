from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, File, Form, UploadFile, status

from app.config import settings
from app.dependencies import CurrentUser, DatabaseDep, require_owned
from app.enums import ProcessingMode
from app.errors import AppError
from app.schemas import RagQuestionRequest, RenameRequest
from app.services.ai import gemini_service
from app.services.parsing import chunk_text, extract_text
from app.services.plans import ensure_document_capacity, increment_upload_counter
from app.services.rag import retrieve_chunks
from app.services.storage import storage_service
from app.utils import parse_object_id, serialize, utc_now


router = APIRouter(prefix="/documents", tags=["Documents"])


def _validate_file(filename: str, content_type: str | None) -> None:
    extension = Path(filename).suffix.lower()
    if extension not in settings.allowed_file_extensions:
        raise AppError(
            code="UNSUPPORTED_FILE_EXTENSION",
            message=f"Phần mở rộng {extension or '(trống)'} chưa được hỗ trợ.",
            status_code=415,
            resolution="Dùng file PDF, DOCX hoặc TXT.",
        )
    if content_type and content_type not in settings.allowed_mime_types and content_type != "application/octet-stream":
        raise AppError(
            code="UNSUPPORTED_MIME_TYPE",
            message=f"MIME type {content_type} chưa được hỗ trợ.",
            status_code=415,
            resolution="Xuất lại tài liệu thành PDF, DOCX hoặc TXT chuẩn.",
        )


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    user: CurrentUser,
    db: DatabaseDep,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    processingMode: ProcessingMode = Form(default=ProcessingMode.GENERATE_FROM_DOCUMENT),
) -> dict:
    filename = file.filename or "document"
    _validate_file(filename, file.content_type)
    content = await file.read()
    await ensure_document_capacity(db, user, len(content))
    if not content:
        raise AppError(
            code="EMPTY_FILE",
            message="File tải lên không có nội dung.",
            status_code=422,
            resolution="Chọn một file có dữ liệu rồi thử lại.",
        )
    document_id = ObjectId()
    now = utc_now()
    extracted = extract_text(content, filename)
    if not extracted.strip():
        raise AppError(
            code="TEXT_EXTRACTION_FAILED",
            message="Không trích xuất được chữ từ tài liệu.",
            status_code=422,
            resolution="Nếu PDF là ảnh scan, hãy OCR hoặc xuất lại thành PDF có lớp văn bản.",
        )
    file_info = await storage_service.upload(
        content,
        user_id=str(user["_id"]),
        document_id=str(document_id),
        original_name=filename,
        mime_type=file.content_type or "application/octet-stream",
    )
    chunks = chunk_text(extracted)[:200]
    document = {
        "_id": document_id,
        "userId": user["_id"],
        "name": (name or Path(filename).stem).strip()[:160],
        "originalFileName": filename,
        "processingMode": processingMode.value,
        "file": file_info,
        "status": "READY",
        "summary": chunks[0][:500] if chunks else "",
        "topics": [],
        "processing": {"analyzed": True, "chunked": bool(chunks), "embedded": False},
        "createdAt": now,
        "updatedAt": now,
    }
    await db.documents.insert_one(document)
    if chunks:
        chunk_documents = []
        embedded = False
        for index, text in enumerate(chunks):
            embedding = await gemini_service.embed(text) if index < 80 else None
            embedded = embedded or embedding is not None
            chunk_documents.append(
                {
                    "documentId": document_id,
                    "chunkIndex": index,
                    "content": text,
                    "location": {"pageStart": None, "pageEnd": None},
                    "embedding": embedding,
                    "tokenCount": max(1, len(text) // 4),
                    "createdAt": now,
                }
            )
        await db.document_chunks.insert_many(chunk_documents)
        if embedded:
            document["processing"]["embedded"] = True
            await db.documents.update_one(
                {"_id": document_id},
                {"$set": {"processing.embedded": True}},
            )
    await increment_upload_counter(db, user["_id"])
    return serialize(document)


@router.get("")
async def list_documents(user: CurrentUser, db: DatabaseDep) -> list[dict]:
    documents = await db.documents.find({"userId": user["_id"]}).sort("createdAt", -1).to_list(None)
    return serialize(documents)


@router.get("/{document_id}")
async def get_document(document_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    item = await require_owned(
        db.documents, parse_object_id(document_id, "documentId"), user["_id"], "userId", "document"
    )
    banks = await db.question_banks.find({"ownerId": user["_id"], "source.documentId": item["_id"]}).sort("createdAt", -1).to_list(None)
    response = serialize(item)
    response["questionBanks"] = serialize(banks)
    return response


@router.patch("/{document_id}")
async def rename_document(
    document_id: str, payload: RenameRequest, user: CurrentUser, db: DatabaseDep
) -> dict:
    object_id = parse_object_id(document_id, "documentId")
    await require_owned(db.documents, object_id, user["_id"], "userId", "document")
    await db.documents.update_one(
        {"_id": object_id}, {"$set": {"name": payload.name.strip(), "updatedAt": utc_now()}}
    )
    return serialize(await db.documents.find_one({"_id": object_id}))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, user: CurrentUser, db: DatabaseDep) -> None:
    object_id = parse_object_id(document_id, "documentId")
    document = await require_owned(db.documents, object_id, user["_id"], "userId", "document")
    await storage_service.delete(document.get("file", {}))
    await db.document_chunks.delete_many({"documentId": object_id})
    await db.documents.delete_one({"_id": object_id})
    await db.question_banks.update_many(
        {"ownerId": user["_id"], "source.documentId": object_id},
        {"$set": {"source.documentId": None, "updatedAt": utc_now()}},
    )


@router.post("/{document_id}/ask")
async def ask_document(
    document_id: str,
    payload: RagQuestionRequest,
    user: CurrentUser,
    db: DatabaseDep,
) -> dict:
    object_id = parse_object_id(document_id, "documentId")
    await require_owned(db.documents, object_id, user["_id"], "userId", "document")
    chunks = await retrieve_chunks(db, object_id, payload.question, payload.maxChunks)
    answer = await gemini_service.answer_with_context(
        payload.question, [chunk["content"] for chunk in chunks]
    )
    return serialize(
        {
            "answer": answer,
            "sources": [
                {"chunkIndex": chunk.get("chunkIndex"), "score": chunk.get("score"), "preview": chunk["content"][:240]}
                for chunk in chunks
            ],
        }
    )

