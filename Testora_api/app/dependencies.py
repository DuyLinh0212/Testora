from typing import Annotated, Any

from bson import ObjectId
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.config import settings
from app.database import get_database
from app.errors import AppError
from app.security import decode_token


oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")
DatabaseDep = Annotated[Any, Depends(get_database)]


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DatabaseDep,
) -> dict:
    payload = decode_token(token, "access")
    user_id = payload.get("sub")
    if not user_id or not ObjectId.is_valid(user_id):
        raise AppError(
            code="INVALID_TOKEN_SUBJECT",
            message="Token không chứa tài khoản hợp lệ.",
            status_code=401,
            resolution="Đăng nhập lại để nhận token mới.",
        )
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise AppError(
            code="USER_NOT_FOUND",
            message="Tài khoản của phiên này không còn tồn tại.",
            status_code=401,
            resolution="Đăng nhập bằng một tài khoản đang hoạt động.",
        )
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


async def require_owned(
    collection: Any,
    item_id: ObjectId,
    user_id: ObjectId,
    owner_field: str,
    resource_name: str,
) -> dict:
    item = await collection.find_one({"_id": item_id, owner_field: user_id})
    if not item:
        raise AppError(
            code=f"{resource_name.upper()}_NOT_FOUND",
            message=f"Không tìm thấy {resource_name} hoặc bạn không có quyền truy cập.",
            status_code=404,
            resolution=f"Kiểm tra id {resource_name} và tài khoản đang đăng nhập.",
        )
    return item
