from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, status
from pymongo.errors import DuplicateKeyError

from app.dependencies import CurrentUser, DatabaseDep
from app.errors import AppError
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    UpdateProfileRequest,
)
from app.security import create_token, decode_token, hash_password, token_digest, verify_password
from app.utils import public_user, serialize, utc_now
from app.config import settings


router = APIRouter(prefix="/auth", tags=["Authentication"])


async def _issue_tokens(db, user_id: ObjectId) -> dict:
    access_token, _ = create_token(str(user_id), "access")
    refresh_token, jti = create_token(str(user_id), "refresh")
    now = utc_now()
    await db.refresh_sessions.insert_one(
        {
            "jti": jti,
            "userId": user_id,
            "tokenDigest": token_digest(refresh_token),
            "createdAt": now,
            "expiresAt": now + timedelta(days=settings.refresh_token_expire_days),
        }
    )
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "tokenType": "bearer",
        "expiresIn": settings.access_token_expire_minutes * 60,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DatabaseDep) -> dict:
    now = utc_now()
    user = {
        "email": payload.email,
        "username": payload.username,
        "passwordHash": hash_password(payload.password),
        "currentPlan": "FREE",
        "subscriptionId": None,
        "settings": {"language": "vi"},
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        user["_id"] = (await db.users.insert_one(user)).inserted_id
    except DuplicateKeyError as exc:
        raise AppError(
            code="ACCOUNT_ALREADY_EXISTS",
            message="Email hoặc tên người dùng đã được sử dụng.",
            status_code=409,
            resolution="Dùng email/tên khác hoặc đăng nhập vào tài khoản hiện có.",
        ) from exc
    return {"user": public_user(user), "tokens": await _issue_tokens(db, user["_id"])}


@router.post("/login")
async def login(payload: LoginRequest, db: DatabaseDep) -> dict:
    identifier = payload.identifier.strip()
    query = {"email": identifier.lower()} if "@" in identifier else {"username": identifier}
    user = await db.users.find_one(query)
    if not user or not verify_password(payload.password, user["passwordHash"]):
        raise AppError(
            code="INVALID_CREDENTIALS",
            message="Email/tên người dùng hoặc mật khẩu không đúng.",
            status_code=401,
            resolution="Kiểm tra thông tin đăng nhập hoặc đặt lại mật khẩu.",
        )
    return {"user": public_user(user), "tokens": await _issue_tokens(db, user["_id"])}


@router.post("/refresh")
async def refresh(payload: RefreshRequest, db: DatabaseDep) -> dict:
    token_payload = decode_token(payload.refreshToken, "refresh")
    session = await db.refresh_sessions.find_one(
        {"jti": token_payload.get("jti"), "tokenDigest": token_digest(payload.refreshToken)}
    )
    if not session:
        raise AppError(
            code="REFRESH_SESSION_REVOKED",
            message="Refresh token đã bị thu hồi hoặc không còn tồn tại.",
            status_code=401,
            resolution="Đăng nhập lại để tạo phiên mới.",
        )
    user_id = ObjectId(token_payload["sub"])
    await db.refresh_sessions.delete_one({"_id": session["_id"]})
    return {"tokens": await _issue_tokens(db, user_id)}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: DatabaseDep) -> None:
    try:
        token_payload = decode_token(payload.refreshToken, "refresh")
    except AppError:
        return
    await db.refresh_sessions.delete_one({"jti": token_payload.get("jti")})


@router.get("/me")
async def me(user: CurrentUser) -> dict:
    return public_user(user)


@router.patch("/me")
async def update_me(payload: UpdateProfileRequest, user: CurrentUser, db: DatabaseDep) -> dict:
    updates = payload.model_dump(exclude_none=True)
    set_values = {"updatedAt": utc_now()}
    if "username" in updates:
        set_values["username"] = updates["username"]
    if "language" in updates:
        set_values["settings.language"] = updates["language"]
    try:
        await db.users.update_one({"_id": user["_id"]}, {"$set": set_values})
    except DuplicateKeyError as exc:
        raise AppError(
            code="USERNAME_TAKEN",
            message="Tên người dùng này đã được sử dụng.",
            status_code=409,
            resolution="Chọn một tên người dùng khác.",
        ) from exc
    updated = await db.users.find_one({"_id": user["_id"]})
    return public_user(updated)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest, user: CurrentUser, db: DatabaseDep
) -> None:
    if not verify_password(payload.currentPassword, user["passwordHash"]):
        raise AppError(
            code="CURRENT_PASSWORD_INCORRECT",
            message="Mật khẩu hiện tại không đúng.",
            status_code=400,
            resolution="Nhập lại mật khẩu hiện tại trước khi đổi.",
        )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"passwordHash": hash_password(payload.newPassword), "updatedAt": utc_now()}},
    )
    await db.refresh_sessions.delete_many({"userId": user["_id"]})


@router.post("/forgot-password")
async def forgot_password(_: ForgotPasswordRequest) -> dict:
    return {
        "message": "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi.",
        "deliveryConfigured": False,
    }

