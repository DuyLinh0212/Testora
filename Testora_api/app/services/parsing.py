import io
import re
from collections.abc import Iterable
from pathlib import Path

from app.errors import AppError
from app.schemas import ParsedQuestion, QuestionOption


def extract_text(content: bytes, filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension == ".txt":
        for encoding in ("utf-8-sig", "utf-8", "cp1258", "latin-1"):
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
    if extension == ".pdf":
        from pypdf import PdfReader

        try:
            reader = PdfReader(io.BytesIO(content))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception as exc:
            raise AppError(
                code="PDF_PARSE_FAILED",
                message="Không thể đọc cấu trúc PDF này.",
                status_code=422,
                resolution="Xuất lại PDF, bỏ mật khẩu mã hóa hoặc OCR tài liệu rồi thử lại.",
                details={"reason": type(exc).__name__},
            ) from exc
    if extension == ".docx":
        from docx import Document

        try:
            document = Document(io.BytesIO(content))
            return "\n".join(paragraph.text for paragraph in document.paragraphs)
        except Exception as exc:
            raise AppError(
                code="DOCX_PARSE_FAILED",
                message="Không thể đọc cấu trúc DOCX này.",
                status_code=422,
                resolution="Mở và lưu lại tài liệu bằng Word hoặc LibreOffice rồi thử lại.",
                details={"reason": type(exc).__name__},
            ) from exc
    raise AppError(
        code="UNSUPPORTED_FILE_TYPE",
        message="Định dạng file chưa được hỗ trợ.",
        status_code=415,
        resolution="Dùng file PDF, DOCX hoặc TXT.",
    )


def chunk_text(text: str, target_words: int = 450, overlap_words: int = 60) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(len(words), start + target_words)
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = max(start + 1, end - overlap_words)
    return chunks


QUESTION_RE = re.compile(r"^(?:(?:câu|question)\s*)?(\d{1,4})\s*[\.:\)]\s*(.+)$", re.I)
OPTION_RE = re.compile(r"^([A-D])\s*[\.:\)]\s*(.+)$", re.I)
ANSWER_RE = re.compile(r"^(?:(?:câu|question)\s*)?(\d{1,4})\s*[-:=]\s*([A-D])\s*$", re.I)
INLINE_ANSWER_RE = re.compile(r"^(?:đáp\s*án|answer)\s*[:\-]\s*([A-D])\b", re.I)
EXPLANATION_RE = re.compile(r"^(?:giải\s*thích|explanation)\s*[:\-]\s*(.+)$", re.I)


def parse_questions(text: str) -> list[ParsedQuestion]:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    answer_key: dict[int, str] = {}
    for line in lines:
        match = ANSWER_RE.fullmatch(line)
        if match:
            answer_key[int(match.group(1))] = match.group(2).upper()

    parsed: list[ParsedQuestion] = []
    current_number: int | None = None
    current_content: list[str] = []
    current_options: list[QuestionOption] = []
    current_answer: str | None = None
    current_explanation: list[str] = []

    def flush() -> None:
        nonlocal current_number, current_content, current_options, current_answer, current_explanation
        if current_number is not None and current_content and len(current_options) >= 2:
            answer = current_answer or answer_key.get(current_number)
            parsed.append(
                ParsedQuestion(
                    content=" ".join(current_content).strip(),
                    options=current_options,
                    correctAnswer=answer,
                    explanation=(
                        " ".join(current_explanation).strip()
                        or "Đáp án được trích xuất từ tài liệu gốc."
                    ),
                )
            )
        current_number = None
        current_content = []
        current_options = []
        current_answer = None
        current_explanation = []

    for line in lines:
        if not line or ANSWER_RE.fullmatch(line):
            continue
        question_match = QUESTION_RE.match(line)
        option_match = OPTION_RE.match(line)
        if question_match and not option_match:
            flush()
            current_number = int(question_match.group(1))
            current_content = [question_match.group(2)]
            continue
        if current_number is None:
            continue
        if option_match:
            current_options.append(
                QuestionOption(id=option_match.group(1).upper(), content=option_match.group(2))
            )
            continue
        answer_match = INLINE_ANSWER_RE.match(line)
        if answer_match:
            current_answer = answer_match.group(1).upper()
            continue
        explanation_match = EXPLANATION_RE.match(line)
        if explanation_match:
            current_explanation.append(explanation_match.group(1))
            continue
        if current_options:
            if current_explanation:
                current_explanation.append(line)
            else:
                current_options[-1].content += f" {line}"
        else:
            current_content.append(line)
    flush()
    return parsed


def validate_imported_questions(questions: Iterable[ParsedQuestion]) -> list[ParsedQuestion]:
    valid = list(questions)
    if not valid:
        raise AppError(
            code="QUESTION_PARSE_FAILED",
            message="Không nhận diện được cấu trúc câu hỏi trong file.",
            status_code=422,
            resolution="Kiểm tra mẫu Câu 1 / A. / B. / đáp án 1-B hoặc bật Gemini fallback.",
        )
    missing_answers = [index + 1 for index, question in enumerate(valid) if not question.correctAnswer]
    if missing_answers:
        raise AppError(
            code="ANSWER_KEY_MISSING",
            message="Một số câu chưa có đáp án đúng nên chưa thể tạo quiz.",
            status_code=422,
            resolution="Bổ sung đáp án dạng '1-B' hoặc 'Đáp án: B' trong tài liệu.",
            details={"questionNumbers": missing_answers[:20]},
        )
    return valid
