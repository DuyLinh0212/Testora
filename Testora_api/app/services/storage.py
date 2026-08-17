import asyncio
import secrets
from io import BytesIO
from pathlib import Path
from typing import Any

from app.config import settings
from app.errors import AppError


class StorageService:
    def __init__(self) -> None:
        settings.upload_path.mkdir(parents=True, exist_ok=True)

    async def upload(
        self,
        content: bytes,
        *,
        user_id: str,
        document_id: str,
        original_name: str,
        mime_type: str,
    ) -> dict[str, Any]:
        if settings.storage_backend.lower() == "cloudinary" and settings.cloudinary_configured:
            return await self._upload_cloudinary(
                content,
                user_id=user_id,
                document_id=document_id,
                original_name=original_name,
                mime_type=mime_type,
            )
        suffix = Path(original_name).suffix.lower()
        filename = f"{document_id}-{secrets.token_hex(4)}{suffix}"
        relative = Path(user_id) / "documents" / filename
        destination = settings.upload_path / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(destination.write_bytes, content)
        return {
            "provider": "local",
            "publicId": relative.as_posix(),
            "secureUrl": f"/api/files/{relative.as_posix()}",
            "mimeType": mime_type,
            "size": len(content),
        }

    async def delete(self, file_info: dict[str, Any]) -> None:
        provider = file_info.get("provider")
        public_id = file_info.get("publicId")
        if not public_id:
            return
        if provider == "cloudinary":
            import cloudinary.uploader

            await asyncio.to_thread(
                cloudinary.uploader.destroy,
                public_id,
                resource_type="raw",
                invalidate=True,
            )
            return
        target = (settings.upload_path / public_id).resolve()
        root = settings.upload_path.resolve()
        if root not in target.parents:
            raise ValueError("Đường dẫn file local nằm ngoài thư mục uploads")
        if target.exists():
            await asyncio.to_thread(target.unlink)

    async def _upload_cloudinary(self, content: bytes, **context: str) -> dict[str, Any]:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        folder = f"testora/users/{context['user_id']}/documents/{context['document_id']}"
        stream = BytesIO(content)
        stream.name = context["original_name"]
        try:
            result = await asyncio.to_thread(
                cloudinary.uploader.upload,
                stream,
                resource_type="raw",
                folder=folder,
                public_id=Path(context["original_name"]).stem,
                overwrite=False,
            )
        except Exception as exc:
            raise AppError(
                code="STORAGE_UPLOAD_FAILED",
                message="Cloudinary chưa thể lưu tài liệu.",
                status_code=502,
                resolution="Kiểm tra Cloud name, API key, API secret trên Render rồi thử lại.",
                retryable=True,
                details={"provider": "cloudinary", "reason": type(exc).__name__},
            ) from exc
        return {
            "provider": "cloudinary",
            "publicId": result["public_id"],
            "secureUrl": result["secure_url"],
            "mimeType": context["mime_type"],
            "size": len(content),
        }


storage_service = StorageService()
