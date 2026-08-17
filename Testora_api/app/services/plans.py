from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from pymongo import ReturnDocument

from app.config import settings
from app.enums import PlanCode
from app.errors import AppError
from app.utils import serialize, utc_now


def usage_date_key() -> str:
    """Return the quota date in the product's configured business timezone."""
    return datetime.now(ZoneInfo(settings.app_timezone)).date().isoformat()


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
    today = usage_date_key()
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


async def consume_ai_quota(db: Any, user: dict, reservation_id: Any) -> dict:
    plan = await get_plan(db, user.get("currentPlan", PlanCode.FREE.value))
    limit = plan["limits"]["aiGenerationsPerDay"]
    today = usage_date_key()
    key = {"userId": user["_id"], "date": today}
    await db.usage_counters.update_one(
        key,
        {
            "$setOnInsert": {
                "usage": {
                    "aiGenerations": 0,
                    "aiReservationIds": [],
                    "uploads": 0,
                    "apiRequests": 0,
                },
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
    await db.usage_counters.update_one(
        {**key, "usage.aiReservationIds": {"$exists": False}},
        {"$set": {"usage.aiReservationIds": []}},
    )
    query = {**key, "usage.aiReservationIds": {"$ne": reservation_id}}
    if limit is not None:
        query["usage.aiGenerations"] = {"$lt": limit}
    updated = await db.usage_counters.find_one_and_update(
        query,
        {
            "$inc": {"usage.aiGenerations": 1},
            "$addToSet": {"usage.aiReservationIds": reservation_id},
            "$set": {"updatedAt": utc_now()},
        },
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
    return {"plan": plan, "usage": updated, "date": today, "reservationId": reservation_id}


async def refund_ai_quota(
    db: Any,
    user_id: Any,
    quota_date: str,
    reservation_id: Any,
) -> bool:
    """Refund one failed job exactly once using its reservation identifier."""
    result = await db.usage_counters.update_one(
        {
            "userId": user_id,
            "date": quota_date,
            "usage.aiGenerations": {"$gt": 0},
            "usage.aiReservationIds": reservation_id,
        },
        {
            "$inc": {"usage.aiGenerations": -1},
            "$pull": {"usage.aiReservationIds": reservation_id},
            "$set": {"updatedAt": utc_now()},
        },
    )
    return result.modified_count == 1


async def increment_upload_counter(db: Any, user_id: Any) -> None:
    today = usage_date_key()
    key = {"userId": user_id, "date": today}
    await db.usage_counters.update_one(
        key,
        {
            "$setOnInsert": {
                "usage": {
                    "aiGenerations": 0,
                    "aiReservationIds": [],
                    "uploads": 0,
                    "apiRequests": 0,
                },
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
