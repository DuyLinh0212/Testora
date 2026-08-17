from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / "atlas-credentials.env", BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Testora API"
    app_env: str = "development"
    api_prefix: str = "/api"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "testora"

    jwt_secret_key: str = "development-only-change-this-secret-key-now"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    frontend_url: str = "http://localhost:4200"

    storage_backend: str = "local"
    local_upload_dir: str = "uploads"
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    atlas_vector_index: str = "document_chunks_vector"

    rate_limit_global_per_minute: int = 120
    rate_limit_login_per_minute: int = 10
    rate_limit_upload_per_10_minutes: int = 10
    rate_limit_ai_per_minute: int = 5
    rate_limit_quiz_submit_per_minute: int = 10

    allowed_file_extensions: tuple[str, ...] = (".pdf", ".docx", ".txt")
    allowed_mime_types: tuple[str, ...] = (
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    )

    @field_validator("api_prefix")
    @classmethod
    def normalize_api_prefix(cls, value: str) -> str:
        return "/" + value.strip("/")

    @field_validator("frontend_url")
    @classmethod
    def strip_frontend_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def upload_path(self) -> Path:
        path = Path(self.local_upload_dir)
        return path if path.is_absolute() else BASE_DIR / path

    @property
    def cloudinary_configured(self) -> bool:
        return all(
            (self.cloudinary_cloud_name, self.cloudinary_api_key, self.cloudinary_api_secret)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

