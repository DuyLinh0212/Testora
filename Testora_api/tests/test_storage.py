from io import BytesIO

import pytest

from app.config import settings
from app.errors import AppError
from app.services.storage import StorageService


@pytest.mark.asyncio
async def test_cloudinary_upload_uses_named_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    import cloudinary
    import cloudinary.uploader

    captured: dict = {}

    def fake_upload(stream: BytesIO, **options: object) -> dict:
        captured["name"] = stream.name
        captured["content"] = stream.read()
        captured["options"] = options
        return {"public_id": "testora/document", "secure_url": "https://example.test/file"}

    monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
    monkeypatch.setattr(settings, "cloudinary_api_key", "test-key")
    monkeypatch.setattr(settings, "cloudinary_api_secret", "test-secret")
    monkeypatch.setattr(cloudinary, "config", lambda **_: None)
    monkeypatch.setattr(cloudinary.uploader, "upload", fake_upload)

    result = await StorageService()._upload_cloudinary(
        b"pdf-content",
        user_id="user-id",
        document_id="document-id",
        original_name="Bài học.pdf",
        mime_type="application/pdf",
    )

    assert captured["name"] == "Bài học.pdf"
    assert captured["content"] == b"pdf-content"
    assert captured["options"]["resource_type"] == "raw"
    assert result["provider"] == "cloudinary"


@pytest.mark.asyncio
async def test_cloudinary_error_is_safe_and_actionable(monkeypatch: pytest.MonkeyPatch) -> None:
    import cloudinary
    import cloudinary.uploader

    monkeypatch.setattr(settings, "cloudinary_cloud_name", "test-cloud")
    monkeypatch.setattr(settings, "cloudinary_api_key", "test-key")
    monkeypatch.setattr(settings, "cloudinary_api_secret", "test-secret")
    monkeypatch.setattr(cloudinary, "config", lambda **_: None)
    monkeypatch.setattr(
        cloudinary.uploader,
        "upload",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("secret detail")),
    )

    with pytest.raises(AppError) as captured:
        await StorageService()._upload_cloudinary(
            b"pdf-content",
            user_id="user-id",
            document_id="document-id",
            original_name="lesson.pdf",
            mime_type="application/pdf",
        )

    assert captured.value.code == "STORAGE_UPLOAD_FAILED"
    assert captured.value.status_code == 502
    assert captured.value.details == {"provider": "cloudinary", "reason": "RuntimeError"}
    assert "secret detail" not in captured.value.message
