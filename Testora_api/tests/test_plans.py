from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

from app.services import plans


@pytest.mark.asyncio
async def test_ai_quota_reservation_is_recorded(monkeypatch: pytest.MonkeyPatch) -> None:
    reservation_id = ObjectId()
    user_id = ObjectId()
    plan = {
        "code": "FREE",
        "active": True,
        "limits": {"aiGenerationsPerDay": 1},
    }
    usage_counters = SimpleNamespace(
        update_one=AsyncMock(),
        find_one_and_update=AsyncMock(
            return_value={"usage": {"aiGenerations": 1, "aiReservationIds": [reservation_id]}}
        ),
    )
    db = SimpleNamespace(
        plans=SimpleNamespace(find_one=AsyncMock(return_value=plan)),
        usage_counters=usage_counters,
    )
    monkeypatch.setattr(plans, "usage_date_key", lambda: "2026-08-18")

    result = await plans.consume_ai_quota(
        db,
        {"_id": user_id, "currentPlan": "FREE"},
        reservation_id,
    )

    query, update = usage_counters.find_one_and_update.await_args.args
    assert query["usage.aiGenerations"] == {"$lt": 1}
    assert query["usage.aiReservationIds"] == {"$ne": reservation_id}
    assert update["$addToSet"]["usage.aiReservationIds"] == reservation_id
    assert result["date"] == "2026-08-18"


@pytest.mark.asyncio
async def test_ai_quota_refund_is_atomic_and_idempotent() -> None:
    reservation_id = ObjectId()
    user_id = ObjectId()
    update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    db = SimpleNamespace(usage_counters=SimpleNamespace(update_one=update_one))

    refunded = await plans.refund_ai_quota(
        db,
        user_id,
        "2026-08-18",
        reservation_id,
    )

    query, update = update_one.await_args.args
    assert refunded is True
    assert query["usage.aiGenerations"] == {"$gt": 0}
    assert query["usage.aiReservationIds"] == reservation_id
    assert update["$inc"]["usage.aiGenerations"] == -1
    assert update["$pull"]["usage.aiReservationIds"] == reservation_id
