from datetime import date
from typing import Any

from pymongo import ReturnDocument

from app.enums import PlanCode
from app.errors import AppError
from app.utils import serialize, utc_now


async def get_plan(db: Any, code: str) -> dict:
    plan = await db.plans.find_one({"code": code, "active": True})
    if not plan:
        raise AppError(
            code="PLAN_NOT_FOUND",
            message="Không tìm thấy cấu hình gói tài khoản.",
            status_code=500,
            resolution="Chạy lại quá trình seed plans hoặc liên hệ quản trị viên.",
        )
    return plan


async def get_usage(db: Any, user: dict) -> dict:
    plan = await get_plan(db, user.get("currentPlan", PlanCode.FREE.value))
    today = date.today().isoformat()
    counter = await db.usage_counters.find_one({"userId": user["_id"], "date": today})
    documents_used = await db.documents.count_documents({"userId": user["_id"]})
    ai_used = (counter or {}).get("usage", {}).get("aiGenerations", 0)
    limits = plan["limits"]
    return serialize(
        {
            "plan": plan["code"],
            "aiGenerations": {
                "used": ai_used,
                "limit": limits["aiGenerationsPerDay"],
            },
            "documents": {
                "used": documents_used,
                "limit": limits["maxStoredDocuments"],
            },
            "maxFileSizeMb": limits["maxFileSizeMb"],
            "advancedGeneration": limits["advancedGeneration"],
        }
    )


async def ensure_document_capacity(db: Any, user: dict, size_bytes: int) -> dict:
    plan = await get_plan(db, user.get("currentPlan", PlanCode.FREE.value))
    limits = plan["limits"]
    max_bytes = limits["maxFileSizeMb"] * 1024 * 1024
    if size_bytes > max_bytes:
        raise AppError(
            code="FILE_TOO_LARGE",
            message=f"File vượt giới hạn {limits['maxFileSizeMb']} MB của gói {plan['code']}.",
            status_code=413,
            resolution="Chọn file nhỏ hơn, nén tài liệu hoặc nâng cấp gói.",
            details={"maxFileSizeMb": limits["maxFileSizeMb"], "receivedBytes": size_bytes},
        )
    used = await db.documents.count_documents({"userId": user["_id"]})
    if used >= limits["maxStoredDocuments"]:
        raise AppError(
            code="DOCUMENT_LIMIT_REACHED",
            message=f"Bạn đã dùng {used}/{limits['maxStoredDocuments']} tài liệu của gói {plan['code']}.",
            status_code=409,
            resolution="Xóa tài liệu cũ hoặc nâng cấp gói. Bộ câu hỏi đã tạo sẽ không bị xóa.",
        )
    return plan


async def consume_ai_quota(db: Any, user: dict) -> dict:
    plan = await get_plan(db, user.get("currentPlan", PlanCode.FREE.value))
    limit = plan["limits"]["aiGenerationsPerDay"]
    today = date.today().isoformat()
    key = {"userId": user["_id"], "date": today}
    await db.usage_counters.update_one(
        key,
        {
            "$setOnInsert": {
                "usage": {"aiGenerations": 0, "uploads": 0, "apiRequests": 0},
                "createdAt": utc_now(),
            },
            "$set": {"updatedAt": utc_now()},
        },
        upsert=True,
    )
    await db.usage_counters.update_one(
        {**key, "usage.aiGenerations": {"$exists": False}},
        {"$set": {"usage.aiGenerations": 0}},
    )
    query = key if limit is None else {**key, "usage.aiGenerations": {"$lt": limit}}
    updated = await db.usage_counters.find_one_and_update(
        query,
        {"$inc": {"usage.aiGenerations": 1}, "$set": {"updatedAt": utc_now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise AppError(
            code="AI_QUOTA_EXCEEDED",
            message=f"Bạn đã dùng hết {limit} lượt tạo AI hôm nay.",
            status_code=429,
            resolution="Thử lại vào ngày mai hoặc nâng cấp gói để có thêm lượt.",
            details={"limit": limit, "plan": plan["code"]},
        )
    return {"plan": plan, "usage": updated}


async def increment_upload_counter(db: Any, user_id: Any) -> None:
    today = date.today().isoformat()
    key = {"userId": user_id, "date": today}
    await db.usage_counters.update_one(
        key,
        {
            "$setOnInsert": {
                "usage": {"aiGenerations": 0, "uploads": 0, "apiRequests": 0},
                "createdAt": utc_now(),
            },
            "$set": {"updatedAt": utc_now()},
        },
        upsert=True,
    )
    await db.usage_counters.update_one(
        key,
        {"$inc": {"usage.uploads": 1}, "$set": {"updatedAt": utc_now()}},
    )
