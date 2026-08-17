import hashlib
import secrets
from datetime import timedelta
from typing import Any, Literal

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.config import settings
from app.errors import AppError
from app.utils import utc_now


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_token(
    user_id: str,
    token_type: Literal["access", "refresh"],
    *,
    jti: str | None = None,
) -> tuple[str, str]:
    now = utc_now()
    token_id = jti or secrets.token_urlsafe(24)
    expires = now + (
        timedelta(minutes=settings.access_token_expire_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_expire_days)
    )
    payload = {
        "sub": user_id,
        "type": token_type,
        "jti": token_id,
        "iat": now,
        "exp": expires,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm), token_id


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except InvalidTokenError as exc:
        raise AppError(
            code="INVALID_TOKEN",
            message="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
            status_code=401,
            resolution="Đăng nhập lại để nhận phiên mới.",
        ) from exc
    if expected_type and payload.get("type") != expected_type:
        raise AppError(
            code="INVALID_TOKEN_TYPE",
            message=f"Endpoint này yêu cầu {expected_type} token.",
            status_code=401,
            resolution=f"Gửi đúng {expected_type} token.",
        )
    return payload


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

