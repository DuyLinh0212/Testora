from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import database, get_database
from app.errors import AppError, error_payload, register_exception_handlers
from app.routers import account, auth, documents, question_banks, quizzes
from app.security import decode_token
from app.services.rate_limit import check_rate_limit


@asynccontextmanager
async def lifespan(_: FastAPI):
    await database.connect()
    yield
    await database.close()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API cho nền tảng tạo và làm quiz Testora.",
    lifespan=lifespan,
)

allowed_origins = list(
    dict.fromkeys(
        [
            settings.frontend_url,
            *(
                [
                    "http://127.0.0.1:4200",
                    "http://localhost:4200",
                    "http://127.0.0.1:4201",
                ]
                if settings.app_env == "development"
                else []
            ),
        ]
    )
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in {"/health", "/docs", "/openapi.json", "/redoc"}:
        return await call_next(request)
    identity = "anonymous"
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        try:
            identity = decode_token(authorization.split(" ", 1)[1]).get("sub", "anonymous")
        except AppError:
            pass
    ip_address = request.client.host if request.client else "unknown"
    try:
        await check_rate_limit(
            get_database(),
            identity=identity,
            ip_address=ip_address,
            path=request.url.path,
            method=request.method,
        )
    except AppError as exc:
        response = JSONResponse(status_code=exc.status_code, content=error_payload(exc))
        retry_after = (exc.details or {}).get("retryAfterSeconds") if isinstance(exc.details, dict) else None
        if retry_after:
            response.headers["Retry-After"] = str(retry_after)
        return response
    return await call_next(request)


register_exception_handlers(app)

if settings.storage_backend.lower() == "local":
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    app.mount(f"{settings.api_prefix}/files", StaticFiles(directory=settings.upload_path), name="files")

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(account.router, prefix=settings.api_prefix)
app.include_router(documents.router, prefix=settings.api_prefix)
app.include_router(question_banks.router, prefix=settings.api_prefix)
app.include_router(quizzes.router, prefix=settings.api_prefix)


@app.get("/health", tags=["System"])
async def health() -> dict:
    await get_database().command({"ping": 1})
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
        "storage": settings.storage_backend,
        "aiConfigured": bool(settings.gemini_api_key),
    }


# Keep CORS outside ServerErrorMiddleware so unexpected 500 responses remain
# readable by the frontend instead of being masked as a generic CORS failure.
app = CORSMiddleware(
    app=app,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)
