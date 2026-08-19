import re
import secrets
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.errors import AppError
from app.utils import serialize, utc_now


TRANSFER_CODE = re.compile(r"\b(TSTP[A-F0-9]{10})\b", re.IGNORECASE)


def _clean_account(value: str | None) -> str:
    return "".join(character for character in value or "" if character.isdigit())


def _plan_amount(plan_code: str) -> int:
    prices = {"PRO": settings.payment_pro_price_vnd, "MAX": settings.payment_max_price_vnd}
    amount = prices.get(plan_code)
    if not amount or amount <= 0:
        raise AppError(
            "PAYMENT_PLAN_UNAVAILABLE",
            "Gói này chưa có cấu hình thanh toán hợp lệ.",
            503,
            resolution="Liên hệ quản trị viên để kiểm tra giá gói.",
        )
    return amount


def require_payment_configuration() -> None:
    if not settings.payments_configured:
        raise AppError(
            "PAYMENTS_UNAVAILABLE",
            "Thanh toán chuyển khoản đang được cấu hình.",
            503,
            resolution="Vui lòng thử lại sau hoặc liên hệ quản trị viên.",
        )


def webhook_key_matches(authorization: str | None) -> bool:
    """So khớp header Authorization của SePay với khóa đã cấu hình.

    SePay gửi ``Apikey <khóa>``. Chấp nhận cả ``Bearer`` và khóa trần, bỏ qua
    hoa/thường của tên scheme cùng khoảng trắng thừa, vì các sai lệch đó chỉ là
    lỗi cấu hình chứ không làm khóa bớt bí mật. Bản thân khóa vẫn phải trùng
    từng ký tự và được so sánh trong thời gian không đổi.
    """
    expected = settings.sepay_webhook_api_key
    if not expected or not authorization:
        return False
    token = authorization.strip()
    scheme, _, remainder = token.partition(" ")
    if scheme.lower() in {"apikey", "bearer"}:
        token = remainder.strip()
    return secrets.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))


def qr_code_url(order: dict) -> str:
    bank_code = settings.payment_bank_code or ""
    account_number = settings.payment_account_number or ""
    query = urlencode(
        {
            "amount": order["amountVnd"],
            "addInfo": order["transferCode"],
            "accountName": settings.payment_account_name or "",
        }
    )
    return f"https://img.vietqr.io/image/{bank_code}-{account_number}-compact2.png?{query}"


def public_order(order: dict) -> dict:
    return serialize(
        {
            "_id": order["_id"],
            "planCode": order["planCode"],
            "amountVnd": order["amountVnd"],
            "transferCode": order["transferCode"],
            "status": order["status"],
            "expiresAt": order["expiresAt"],
            "paidAt": order.get("paidAt"),
            "fulfilledAt": order.get("fulfilledAt"),
            "bank": order["bank"],
            "qrCodeUrl": qr_code_url(order),
        }
    )


async def create_payment_order(db: Any, user: dict, plan_code: str) -> dict:
    require_payment_configuration()
    if user.get("currentPlan") == plan_code:
        raise AppError(
            "PLAN_ALREADY_ACTIVE",
            "Bạn đang sử dụng gói này.",
            409,
            resolution="Chọn một gói cao hơn hoặc tiếp tục sử dụng gói hiện tại.",
        )

    now = utc_now()
    amount = _plan_amount(plan_code)
    for _ in range(3):
        order = {
            "userId": user["_id"],
            "planCode": plan_code,
            "amountVnd": amount,
            "currency": "VND",
            "transferCode": "TSTP" + secrets.token_hex(5).upper(),
            "status": "PENDING",
            "provider": "SEPAY",
            "bank": {
                "code": settings.payment_bank_code,
                "accountNumber": settings.payment_account_number,
                "accountName": settings.payment_account_name,
            },
            "createdAt": now,
            "expiresAt": now + timedelta(minutes=settings.payment_order_expire_minutes),
            "paidAt": None,
            "fulfilledAt": None,
        }
        try:
            order["_id"] = (await db.payment_orders.insert_one(order)).inserted_id
            return public_order(order)
        except DuplicateKeyError:
            continue
    raise AppError(
        "PAYMENT_ORDER_CREATION_FAILED",
        "Không thể tạo mã chuyển khoản riêng.",
        503,
        resolution="Thử lại sau vài giây.",
        retryable=True,
    )


def _transfer_code(event: Any) -> str | None:
    text = " ".join(
        item for item in (event.code, event.content, event.description) if isinstance(item, str)
    ).upper()
    match = TRANSFER_CODE.search(text)
    return match.group(1).upper() if match else None


async def _fulfill_paid_order(db: Any, order: dict) -> None:
    """Apply a paid order idempotently; retries cannot create a second subscription."""
    now = utc_now()
    await db.subscriptions.update_many(
        {
            "userId": order["userId"],
            "status": "ACTIVE",
            "paymentOrderId": {"$ne": order["_id"]},
        },
        {"$set": {"status": "CANCELLED", "autoRenew": False, "updatedAt": now}},
    )
    subscription = {
        "userId": order["userId"],
        "planCode": order["planCode"],
        "paymentOrderId": order["_id"],
        "status": "ACTIVE",
        "startedAt": order.get("paidAt") or now,
        "expiresAt": (order.get("paidAt") or now) + timedelta(days=30),
        "autoRenew": False,
        "payment": {
            "provider": "SEPAY",
            "externalSubscriptionId": order.get("providerTransactionId"),
        },
        "createdAt": now,
        "updatedAt": now,
    }
    await db.subscriptions.update_one(
        {"paymentOrderId": order["_id"]},
        {"$setOnInsert": subscription},
        upsert=True,
    )
    active_subscription = await db.subscriptions.find_one({"paymentOrderId": order["_id"]})
    await db.users.update_one(
        {"_id": order["userId"]},
        {
            "$set": {
                "currentPlan": order["planCode"],
                "subscriptionId": active_subscription["_id"],
                "updatedAt": now,
            }
        },
    )
    await db.payment_orders.update_one(
        {"_id": order["_id"]},
        {"$set": {"fulfilledAt": now}},
    )


async def process_sepay_event(db: Any, event: Any) -> str:
    """Return a non-sensitive processing result suitable for a webhook response."""
    if event.transferType.lower() not in {"in", "incoming"}:
        return "ignored"
    if _clean_account(event.accountNumber) != _clean_account(settings.payment_account_number):
        return "ignored"
    transfer_code = _transfer_code(event)
    if not transfer_code:
        return "ignored"

    provider_transaction_id = str(event.id)
    existing_transaction = await db.payment_orders.find_one(
        {"providerTransactionId": provider_transaction_id}
    )
    if existing_transaction:
        await _fulfill_paid_order(db, existing_transaction)
        return "duplicate"

    order = await db.payment_orders.find_one({"transferCode": transfer_code})
    if not order or order.get("status") != "PENDING" or order["expiresAt"] < utc_now():
        return "ignored"
    if event.transferAmount != order["amountVnd"]:
        return "ignored"

    now = utc_now()
    result = await db.payment_orders.update_one(
        {
            "_id": order["_id"],
            "status": "PENDING",
            "providerTransactionId": {"$exists": False},
        },
        {
            "$set": {
                "status": "PAID",
                "providerTransactionId": provider_transaction_id,
                "paidAt": now,
                "providerReference": event.referenceCode,
                "transactionAt": event.transactionDate,
            }
        },
    )
    if result.modified_count != 1:
        order = await db.payment_orders.find_one({"_id": order["_id"]})
        if order and order.get("providerTransactionId") == provider_transaction_id:
            await _fulfill_paid_order(db, order)
            return "duplicate"
        return "ignored"

    paid_order = await db.payment_orders.find_one({"_id": order["_id"]})
    await _fulfill_paid_order(db, paid_order)
    return "paid"
