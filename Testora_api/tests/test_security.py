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

