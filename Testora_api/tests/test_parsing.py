import pytest

from app.errors import AppError
from app.services.parsing import (
    chunk_text,
    extract_text,
    parse_questions,
    validate_imported_questions,
)


def test_parser_supports_vietnamese_questions_and_answer_key() -> None:
    text = """
    Câu 1. Chuẩn hóa 3NF nhằm mục đích gì?
    A. Tăng dư thừa dữ liệu
    B. Giảm phụ thuộc bắc cầu
    C. Xóa mọi khóa ngoại
    D. Tăng số bảng tùy ý

    Câu 2. SQL JOIN dùng để làm gì?
    A. Kết hợp dữ liệu giữa các bảng
    B. Xóa database
    C. Đổi mật khẩu
    D. Tạo file PDF

    1-B
    2-A
    """

    questions = validate_imported_questions(parse_questions(text))

    assert len(questions) == 2
    assert questions[0].correctAnswer == "B"
    assert questions[1].options[0].content == "Kết hợp dữ liệu giữa các bảng"


def test_chunk_text_keeps_overlap_without_infinite_loop() -> None:
    chunks = chunk_text(" ".join(f"word-{index}" for index in range(1000)), 100, 10)

    assert len(chunks) > 1
    assert "word-90" in chunks[1]
    assert chunks[-1].endswith("word-999")


def test_invalid_pdf_returns_actionable_error() -> None:
    with pytest.raises(AppError) as captured:
        extract_text(b"not-a-pdf", "lesson.pdf")

    assert captured.value.code == "PDF_PARSE_FAILED"
    assert captured.value.status_code == 422
