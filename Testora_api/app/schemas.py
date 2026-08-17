from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.enums import Difficulty, ProcessingMode, QuizVisibility


Password = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: Password

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip()


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=20)


class ChangePasswordRequest(BaseModel):
    currentPassword: str
    newPassword: Password


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class UpdateProfileRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    language: Literal["vi", "en"] | None = None


class UpgradeSubscriptionRequest(BaseModel):
    planCode: Literal["PRO", "MAX"]


class RenameRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class QuestionOption(BaseModel):
    id: Literal["A", "B", "C", "D"]
    content: str = Field(min_length=1, max_length=2000)


class Topic(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class QuestionCreate(BaseModel):
    content: str = Field(min_length=5, max_length=5000)
    options: list[QuestionOption] = Field(min_length=2, max_length=6)
    correctAnswer: str = Field(min_length=1, max_length=8)
    explanation: str = Field(min_length=3, max_length=8000)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    questionType: str = Field(default="multiple_choice", max_length=64)
    topic: Topic = Field(default_factory=lambda: Topic(name="Tổng quan"))

    @model_validator(mode="after")
    def correct_answer_exists(self) -> "QuestionCreate":
        option_ids = {option.id for option in self.options}
        if len(option_ids) != len(self.options):
            raise ValueError("Mỗi lựa chọn phải có id duy nhất")
        if self.correctAnswer not in option_ids:
            raise ValueError("correctAnswer phải trùng với id của một lựa chọn")
        return self


class QuestionUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=5, max_length=5000)
    options: list[QuestionOption] | None = Field(default=None, min_length=2, max_length=6)
    correctAnswer: str | None = Field(default=None, min_length=1, max_length=8)
    explanation: str | None = Field(default=None, min_length=3, max_length=8000)
    difficulty: Literal["easy", "medium", "hard"] | None = None
    questionType: str | None = Field(default=None, max_length=64)
    topic: Topic | None = None


class GenerationRequest(BaseModel):
    documentId: str
    mode: Literal["BASIC", "ADVANCED"] = "BASIC"
    questionCount: int = Field(default=10, ge=5, le=100)
    difficulty: Difficulty = Difficulty.MIXED
    distribution: Literal["automatic", "by_topic", "by_chapter"] = "automatic"
    topics: list[str] = Field(default_factory=list, max_length=30)
    questionTypes: list[Literal["recall", "understanding", "application"]] = Field(
        default_factory=lambda: ["recall", "understanding"], min_length=1
    )
    customInstruction: str | None = Field(default=None, max_length=2000)


class QuizConfig(BaseModel):
    questionCount: int = Field(ge=1, le=100)
    durationMinutes: int = Field(default=30, ge=1, le=300)
    shuffleQuestions: bool = True
    # Keep A–D stable so the visible labels always match the source question.
    shuffleOptions: bool = False
    leaderboardEnabled: bool = True


class QuizCreate(BaseModel):
    questionBankId: str
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=2000)
    visibility: QuizVisibility = QuizVisibility.UNLISTED
    config: QuizConfig


class QuizUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=2000)
    visibility: QuizVisibility | None = None
    config: QuizConfig | None = None


class AttemptAnswer(BaseModel):
    questionId: str
    selectedAnswer: str | None = Field(default=None, max_length=8)
    timeSpentSeconds: int = Field(default=0, ge=0, le=86400)


class AttemptSubmit(BaseModel):
    answers: list[AttemptAnswer] = Field(max_length=100)


class RagQuestionRequest(BaseModel):
    question: str = Field(min_length=3, max_length=1500)
    maxChunks: int = Field(default=5, ge=1, le=10)


class GeneratedQuestion(BaseModel):
    content: str
    options: list[QuestionOption]
    correctAnswer: str
    explanation: str
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    questionType: Literal["recall", "understanding", "application"] = "understanding"
    topic: Topic
    evidence: str = ""


class GeneratedQuestionSet(BaseModel):
    questions: list[GeneratedQuestion]


class ParsedQuestion(BaseModel):
    content: str
    options: list[QuestionOption]
    correctAnswer: str | None = None
    explanation: str = "Đáp án được trích xuất từ tài liệu gốc."
