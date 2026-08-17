from typing import Any

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel
from pymongo.server_api import ServerApi

from app.config import settings
from app.enums import PlanCode
from app.utils import utc_now


class DatabaseManager:
    client: AsyncMongoClient | None = None
    db: Any = None

    async def connect(self) -> None:
        self.client = AsyncMongoClient(
            settings.mongodb_uri,
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=8000,
            tz_aware=True,
        )
        self.db = self.client[settings.mongodb_database]
        await self.client.admin.command({"ping": 1})
        await self.ensure_indexes()
        await self.seed_plans()

    async def close(self) -> None:
        if self.client:
            await self.client.close()
        self.client = None
        self.db = None

    async def ensure_indexes(self) -> None:
        await self.db.users.create_indexes(
            [IndexModel("email", unique=True), IndexModel("username", unique=True)]
        )
        await self.db.documents.create_indexes(
            [IndexModel("userId"), IndexModel([("userId", ASCENDING), ("createdAt", DESCENDING)])]
        )
        await self.db.document_chunks.create_indexes(
            [IndexModel("documentId"), IndexModel([("documentId", ASCENDING), ("chunkIndex", ASCENDING)], unique=True)]
        )
        await self.db.question_banks.create_indexes(
            [
                IndexModel("ownerId"),
                IndexModel([("ownerId", ASCENDING), ("createdAt", DESCENDING)]),
                IndexModel("source.documentId"),
            ]
        )
        await self.db.questions.create_indexes(
            [IndexModel("questionBankId"), IndexModel([("questionBankId", ASCENDING), ("difficulty", ASCENDING)])]
        )
        await self.db.quizzes.create_indexes(
            [IndexModel("ownerId"), IndexModel("shareCode", unique=True), IndexModel("visibility")]
        )
        await self.db.quiz_attempts.create_indexes(
            [
                IndexModel("quizId"),
                IndexModel("userId"),
                IndexModel([("quizId", ASCENDING), ("userId", ASCENDING)]),
                IndexModel([("quizId", ASCENDING), ("result.score", DESCENDING), ("durationSeconds", ASCENDING)]),
            ]
        )
        await self.db.usage_counters.create_index([("userId", ASCENDING), ("date", ASCENDING)], unique=True)
        await self.db.rate_limit_records.create_indexes(
            [IndexModel("key", unique=True), IndexModel("expiresAt", expireAfterSeconds=0)]
        )
        await self.db.refresh_sessions.create_indexes(
            [IndexModel("jti", unique=True), IndexModel("expiresAt", expireAfterSeconds=0)]
        )

    async def seed_plans(self) -> None:
        now = utc_now()
        plans = (
            (PlanCode.FREE, "Free", 1, 3, 5, False),
            (PlanCode.PRO, "Pro", 10, 10, 30, True),
            (PlanCode.MAX, "Max", None, 100, 100, True),
        )
        for code, name, ai_limit, docs_limit, file_limit, advanced in plans:
            await self.db.plans.update_one(
                {"code": code.value},
                {
                    "$set": {
                        "name": name,
                        "limits": {
                            "aiGenerationsPerDay": ai_limit,
                            "maxStoredDocuments": docs_limit,
                            "maxFileSizeMb": file_limit,
                            "advancedGeneration": advanced,
                        },
                        "active": True,
                        "updatedAt": now,
                    },
                    "$setOnInsert": {"createdAt": now},
                },
                upsert=True,
            )


database = DatabaseManager()


def get_database() -> Any:
    if database.db is None:
        raise RuntimeError("MongoDB chưa được khởi tạo")
    return database.db
