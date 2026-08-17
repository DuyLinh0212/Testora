import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.errors import AppError
from app.main import app
from app.routers.account import _require_subscription_self_service
from app.schemas import QuizConfig
from app.security import create_token, decode_token, hash_password, verify_password


def test_password_hash_and_verify() -> None:
    hashed = hash_password("a-strong-password")

    assert hashed != "a-strong-password"
    assert verify_password("a-strong-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_round_trip() -> None:
    token, token_id = create_token("507f1f77bcf86cd799439011", "access")
    payload = decode_token(token, "access")

    assert payload["sub"] == "507f1f77bcf86cd799439011"
    assert payload["jti"] == token_id
    assert payload["type"] == "access"


def test_unexpected_errors_keep_cors_headers() -> None:
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/documents", headers={"Origin": settings.frontend_url})

    assert response.status_code == 500
    assert response.headers["access-control-allow-origin"] == settings.frontend_url


def test_quiz_options_keep_a_to_d_order_by_default() -> None:
    assert QuizConfig(questionCount=1).shuffleOptions is False


def test_subscription_self_service_is_locked_by_default() -> None:
    assert settings.subscription_self_service_enabled is False
    with pytest.raises(AppError, match="nâng cấp đang cập nhật"):
        _require_subscription_self_service()
