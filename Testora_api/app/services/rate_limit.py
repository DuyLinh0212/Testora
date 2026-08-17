from datetime import timedelta
from typing import Any

from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.errors import AppError
from app.utils import utc_now


def resolve_rule(path: str, method: str) -> tuple[str, int, int]:
    if path.endswith("/auth/login"):
        return "LOGIN", settings.rate_limit_login_per_minute, 60
    if method == "POST" and path.endswith("/documents"):
        return "UPLOAD", settings.rate_limit_upload_per_10_minutes, 600
    if method == "POST" and path.endswith("/question-banks/generate"):
        return "AI_GENERATION", settings.rate_limit_ai_per_minute, 60
    if method == "POST" and "/quiz-attempts/" in path and path.endswith("/submit"):
        return "QUIZ_SUBMIT", settings.rate_limit_quiz_submit_per_minute, 60
    return "GLOBAL_API", settings.rate_limit_global_per_minute, 60


async def check_rate_limit(
    db: Any,
    *,
    identity: str,
    ip_address: str,
    path: str,
    method: str,
) -> None:
    scope, limit, window_seconds = resolve_rule(path, method)
    now = utc_now()
    epoch = int(now.timestamp())
    window_epoch = epoch - (epoch % window_seconds)
    key = f"{identity}:{ip_address}:{scope}:{window_epoch}"
    expires_at = now + timedelta(seconds=window_seconds + 10)
    try:
        result = await db.rate_limit_records.update_one(
            {"key": key, "requestCount": {"$lt": limit}},
            {
                "$inc": {"requestCount": 1},
                "$setOnInsert": {
                    "identity": identity,
                    "ipAddress": ip_address,
                    "scope": scope,
                    "windowStart": now,
                    "expiresAt": expires_at,
                },
            },
            upsert=True,
        )
    except DuplicateKeyError:
        # Hai request đầu tiên có thể cùng lúc cố upsert một window mới.
        # Request thua race cần thử increment record vừa được tạo, không phải bị 429 giả.
        result = await db.rate_limit_records.update_one(
            {"key": key, "requestCount": {"$lt": limit}},
            {"$inc": {"requestCount": 1}},
        )
    if result is None or (result.matched_count == 0 and result.upserted_id is None):
        wait_seconds = window_seconds - (epoch % window_seconds)
        raise AppError(
            code="RATE_LIMITED",
            message=f"Bạn đã gửi quá nhiều yêu cầu trong phạm vi {scope}.",
            status_code=429,
            resolution=f"Thử lại sau khoảng {wait_seconds} giây.",
            retryable=True,
            details={"scope": scope, "retryAfterSeconds": wait_seconds},
        )
