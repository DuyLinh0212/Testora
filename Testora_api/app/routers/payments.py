from fastapi import APIRouter, Header, status

from app.dependencies import CurrentUser, DatabaseDep
from app.errors import AppError
from app.schemas import PaymentOrderRequest, SePayWebhookEvent
from app.services.payments import (
    create_payment_order,
    process_sepay_event,
    public_order,
    require_payment_configuration,
    webhook_key_matches,
)
from app.utils import parse_object_id


router = APIRouter(tags=["Payments"])


@router.post("/payments/orders", status_code=status.HTTP_201_CREATED)
async def create_order(payload: PaymentOrderRequest, user: CurrentUser, db: DatabaseDep) -> dict:
    return await create_payment_order(db, user, payload.planCode)


@router.get("/payments/orders/{order_id}")
async def get_order(order_id: str, user: CurrentUser, db: DatabaseDep) -> dict:
    order = await db.payment_orders.find_one(
        {"_id": parse_object_id(order_id, "paymentOrderId"), "userId": user["_id"]}
    )
    if not order:
        raise AppError("PAYMENT_ORDER_NOT_FOUND", "Không tìm thấy yêu cầu thanh toán.", 404)
    return public_order(order)


@router.post("/webhooks/sepay", include_in_schema=False)
async def sepay_webhook(
    payload: SePayWebhookEvent,
    db: DatabaseDep,
    authorization: str | None = Header(default=None),
) -> dict:
    require_payment_configuration()
    if not webhook_key_matches(authorization):
        raise AppError(
            "WEBHOOK_UNAUTHORIZED",
            "Webhook không hợp lệ.",
            401,
            resolution="Kiểm tra SEPAY_WEBHOOK_API_KEY của API có trùng API Key trong cấu hình webhook SePay.",
        )
    # Trả lại kết quả xử lý để nhật ký webhook của SePay cho thấy vì sao một
    # giao dịch bị bỏ qua (sai số tiền, sai mã chuyển khoản, đơn đã hết hạn).
    return {"success": True, "result": await process_sepay_event(db, payload)}
