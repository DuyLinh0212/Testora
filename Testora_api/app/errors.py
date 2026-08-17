from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        *,
        resolution: str | None = None,
        retryable: bool = False,
        details: Any = None,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.resolution = resolution
        self.retryable = retryable
        self.details = details
        super().__init__(message)


def error_payload(error: AppError) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "code": error.code,
        "message": error.message,
        "retryable": error.retryable,
    }
    if error.resolution:
        payload["resolution"] = error.resolution
    if error.details is not None:
        payload["details"] = error.details
    return {"error": payload}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_payload(exc))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Dữ liệu gửi lên chưa hợp lệ.",
                    "resolution": "Kiểm tra các trường được liệt kê trong details rồi gửi lại.",
                    "retryable": True,
                    "details": exc.errors(),
                }
            },
        )

