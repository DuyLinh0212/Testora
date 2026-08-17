from datetime import timedelta

from fastapi import APIRouter

from app.config import settings
from app.dependencies import CurrentUser, DatabaseDep
from app.errors import AppError
from app.schemas import UpgradeSubscriptionRequest
from app.services.plans import get_usage
from app.utils import serialize, utc_now


router = APIRouter(tags=["Account"])


def _require_subscription_self_service() -> None:
    if not settings.subscription_self_service_enabled:
        raise AppError(
            code="SUBSCRIPTION_MAINTENANCE",
            message="Hệ thống nâng cấp đang cập nhật.",
            status_code=503,
            resolution="Tạm thời chưa thể tự thay đổi gói. Vui lòng thử lại sau.",
        )


@router.get("/plans")
async def list_plans(db: DatabaseDep) -> list[dict]:
    return serialize(await db.plans.find({"active": True}).sort("limits.maxFileSizeMb", 1).to_list(None))


@router.get("/usage")
async def usage(user: CurrentUser, db: DatabaseDep) -> dict:
    return await get_usage(db, user)


@router.get("/subscription")
async def subscription(user: CurrentUser, db: DatabaseDep) -> dict:
    record = await db.subscriptions.find_one({"userId": user["_id"], "status": "ACTIVE"})
    return serialize(record) if record else {"planCode": "FREE", "status": "ACTIVE", "expiresAt": None}


@router.post("/subscription/upgrade")
async def upgrade(
    payload: UpgradeSubscriptionRequest, user: CurrentUser, db: DatabaseDep
) -> dict:
    _require_subscription_self_service()
    now = utc_now()
    expires_at = now + timedelta(days=30)
    await db.subscriptions.update_many(
        {"userId": user["_id"], "status": "ACTIVE"},
        {"$set": {"status": "CANCELLED", "updatedAt": now}},
    )
    subscription = {
        "userId": user["_id"],
        "planCode": payload.planCode,
        "status": "ACTIVE",
        "startedAt": now,
        "expiresAt": expires_at,
        "autoRenew": False,
        "payment": {"provider": "DEMO", "externalSubscriptionId": None},
        "createdAt": now,
        "updatedAt": now,
    }
    subscription["_id"] = (await db.subscriptions.insert_one(subscription)).inserted_id
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"currentPlan": payload.planCode, "subscriptionId": subscription["_id"], "updatedAt": now}},
    )
    return serialize(subscription)


@router.post("/subscription/cancel")
async def cancel_subscription(user: CurrentUser, db: DatabaseDep) -> dict:
    _require_subscription_self_service()
    now = utc_now()
    await db.subscriptions.update_many(
        {"userId": user["_id"], "status": "ACTIVE"},
        {"$set": {"status": "CANCELLED", "autoRenew": False, "updatedAt": now}},
    )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"currentPlan": "FREE", "subscriptionId": None, "updatedAt": now}},
    )
    return {"planCode": "FREE", "status": "CANCELLED"}


@router.get("/dashboard")
async def dashboard(user: CurrentUser, db: DatabaseDep) -> dict:
    user_id = user["_id"]
    usage_info = await get_usage(db, user)
    counts = {
        "questionBanks": await db.question_banks.count_documents({"ownerId": user_id}),
        "quizzes": await db.quizzes.count_documents({"ownerId": user_id}),
        "attempts": await db.quiz_attempts.count_documents({"userId": user_id, "status": "SUBMITTED"}),
    }
    recent_documents = await db.documents.find({"userId": user_id}).sort("createdAt", -1).limit(4).to_list(None)
    recent_quizzes = await db.quizzes.find({"ownerId": user_id}).sort("createdAt", -1).limit(4).to_list(None)
    recent_results = await db.quiz_attempts.find({"userId": user_id, "status": "SUBMITTED"}).sort("submittedAt", -1).limit(4).to_list(None)
    quiz_ids = [item["quizId"] for item in recent_results]
    quiz_map = {item["_id"]: item["title"] for item in await db.quizzes.find({"_id": {"$in": quiz_ids}}).to_list(None)} if quiz_ids else {}
    for result in recent_results:
        result["quizTitle"] = quiz_map.get(result["quizId"], "Quiz")
    return serialize(
        {
            "usage": usage_info,
            "counts": counts,
            "recentDocuments": recent_documents,
            "recentQuizzes": recent_quizzes,
            "recentResults": recent_results,
        }
    )
