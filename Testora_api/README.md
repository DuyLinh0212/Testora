# Testora API

FastAPI backend cho Testora, dùng MongoDB Atlas, JWT, Cloudinary/local storage và Gemini.

## Chạy local

1. Tạo virtual environment với Python 3.11+.
2. Cài dependency: `pip install -r requirements.txt`.
3. Copy `.env.example` thành `.env` và điền biến cần thiết bằng credential của môi trường chạy.
4. Chạy `uvicorn app.main:app --reload`.
5. Mở Swagger tại `http://localhost:8000/docs`.

Nếu `STORAGE_BACKEND=local`, file được lưu trong `uploads/`. Để dùng Cloudinary, đặt `STORAGE_BACKEND=cloudinary` và cấu hình đủ ba biến Cloudinary.

Nếu chưa có `GEMINI_API_KEY`, luồng tạo câu hỏi vẫn chạy bằng bộ sinh demo xác định để kiểm thử end-to-end. Khi có key, API dùng Gemini và tạo embedding cho tối đa 80 chunk đầu của mỗi tài liệu. RAG ưu tiên Atlas Vector Search và tự hạ xuống tìm kiếm lexical nếu index vector chưa được tạo.

## API chính

- `/api/auth/*`: đăng ký, đăng nhập, refresh, logout, profile và đổi mật khẩu.
- `/api/documents`: upload, danh sách, đổi tên, xóa độc lập với Question Bank.
- `/api/documents/{id}/ask`: hỏi đáp RAG theo tài liệu.
- `/api/question-banks/import`: parser thường trước, Gemini fallback khi cần.
- `/api/question-banks/generate`: atomic quota + AI job theo batch.
- `/api/quizzes/*`: CRUD, share code, start attempt, submit, review, câu sai và leaderboard.
- `/api/dashboard`, `/api/usage`, `/api/plans`, `/api/subscription/*`.

## Lưu ý production

- Đổi `JWT_SECRET_KEY` thành chuỗi ngẫu nhiên tối thiểu 32 ký tự.
- Tạo Atlas Vector Search index tên `document_chunks_vector` trên trường `embedding` (768 chiều) nếu bật RAG vector.
- BackgroundTasks phù hợp MVP một instance. Khi scale nhiều worker, chuyển AI job sang hàng đợi bền vững như Celery/Arq + Redis.
- Endpoint upgrade hiện là luồng demo và chưa thu tiền; model subscription đã tách để cắm Stripe/PayOS/VNPay/Momo sau.
- Không commit `.env`, connection string, token hoặc private key vào repository.
