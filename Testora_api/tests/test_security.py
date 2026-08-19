import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.errors import AppError
from app.main import app
from app.routers.account import _require_subscription_self_service
from app.schemas import GenerationRequest, QuizConfig
from app.services.payments import _clean_account, _transfer_code, webhook_key_matches
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


def test_generation_request_accepts_pro_question_count() -> None:
    request = GenerationRequest(documentId="507f1f77bcf86cd799439011", questionCount=42)
    assert request.questionCount == 42


def test_payment_transfer_code_is_extracted_without_trusting_free_text() -> None:
    event = type(
        "SePayEvent",
        (),
        {"code": None, "content": "tstpabcdef1234 chuyen khoan", "description": None},
    )()
    assert _transfer_code(event) == "TSTPABCDEF1234"
    assert _clean_account("36 142 087") == "36142087"


def test_webhook_key_tolerates_config_formatting_but_not_a_wrong_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "sepay_webhook_api_key", "testora_sepay_abc123")

    assert webhook_key_matches("Apikey testora_sepay_abc123")
    assert webhook_key_matches("  apikey   testora_sepay_abc123  ")
    assert webhook_key_matches("Bearer testora_sepay_abc123")
    assert webhook_key_matches("testora_sepay_abc123")

    assert not webhook_key_matches("Apikey testora_sepay_abc124")
    assert not webhook_key_matches("Apikey ")
    assert not webhook_key_matches(None)


def test_webhook_key_is_unset_when_config_holds_only_quotes_or_spaces() -> None:
    assert Settings(sepay_webhook_api_key='  "  "  ').sepay_webhook_api_key is None
    assert Settings(sepay_webhook_api_key='"testora_sepay_abc123"\n').sepay_webhook_api_key == (
        "testora_sepay_abc123"
    )
