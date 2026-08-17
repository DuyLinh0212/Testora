from datetime import UTC, datetime
from typing import Any

from bson import ObjectId


def utc_now() -> datetime:
    return datetime.now(UTC)


def parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    from app.errors import AppError

    if not ObjectId.is_valid(value):
        raise AppError(
            code="INVALID_ID",
            message=f"{field_name} không đúng định dạng MongoDB ObjectId.",
            status_code=422,
            resolution=f"Hãy gửi {field_name} gồm 24 ký tự hexadecimal.",
        )
    return ObjectId(value)


def serialize(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialize(item) for item in value]
    return value


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    safe = {key: value for key, value in user.items() if key not in {"passwordHash"}}
    return serialize(safe)

