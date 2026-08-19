from functools import lru_cache
from pathlib import Path
import secrets

from pydantic import Field, field_validator, model_validator
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
    app_timezone: str = "Asia/Bangkok"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "testora"

    jwt_secret_key: str | None = None
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    subscription_self_service_enabled: bool = False

    payment_provider: str = "disabled"
    payment_bank_code: str | None = None
    payment_account_number: str | None = None
    payment_account_name: str | None = None
    payment_order_expire_minutes: int = 30
    payment_pro_price_vnd: int = 10_000
    payment_max_price_vnd: int = 49_000
    sepay_webhook_api_key: str | None = None

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

    @field_validator(
        "payment_bank_code",
        "payment_account_number",
        "payment_account_name",
        "sepay_webhook_api_key",
        mode="before",
    )
    @classmethod
    def clean_pasted_value(cls, value: object) -> object:
        """Dán giá trị vào biến môi trường thường kéo theo khoảng trắng hoặc dấu nháy.

        Với khóa webhook, một ký tự thừa làm mọi callback của SePay trả 401 và
        tài khoản không được nâng cấp, nên chuẩn hóa ngay tại đây.
        """
        if not isinstance(value, str):
            return value
        cleaned = value.strip().strip("\"'").strip()
        return cleaned or None

    @model_validator(mode="after")
    def enforce_production_secrets(self) -> "Settings":
        is_production = self.app_env.lower() in {"production", "prod"}
        if not self.jwt_secret_key:
            if is_production:
                raise ValueError("JWT_SECRET_KEY must be configured in production")
            self.jwt_secret_key = secrets.token_urlsafe(48)
            return self

        normalized = self.jwt_secret_key.lower()
        looks_like_placeholder = normalized.startswith(
            ("replace-", "change-", "development-", "example-")
        )
        if is_production and (len(self.jwt_secret_key) < 32 or looks_like_placeholder):
            raise ValueError("JWT_SECRET_KEY must be a strong non-placeholder value")
        return self

    @property
    def upload_path(self) -> Path:
        path = Path(self.local_upload_dir)
        return path if path.is_absolute() else BASE_DIR / path

    @property
    def cloudinary_configured(self) -> bool:
        return all(
            (self.cloudinary_cloud_name, self.cloudinary_api_key, self.cloudinary_api_secret)
        )

    @property
    def payments_configured(self) -> bool:
        return self.payment_provider.lower() == "sepay" and all(
            (
                self.payment_bank_code,
                self.payment_account_number,
                self.payment_account_name,
                self.sepay_webhook_api_key,
            )
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
