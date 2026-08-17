from enum import StrEnum


class PlanCode(StrEnum):
    FREE = "FREE"
    PRO = "PRO"
    MAX = "MAX"


class ProcessingMode(StrEnum):
    GENERATE_FROM_DOCUMENT = "GENERATE_FROM_DOCUMENT"
    IMPORT_EXISTING_QUESTIONS = "IMPORT_EXISTING_QUESTIONS"


class DocumentStatus(StrEnum):
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class BankStatus(StrEnum):
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class JobStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class QuizVisibility(StrEnum):
    PRIVATE = "PRIVATE"
    UNLISTED = "UNLISTED"
    PUBLIC = "PUBLIC"


class Difficulty(StrEnum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    MIXED = "mixed"

