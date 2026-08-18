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
- `/api/payments/orders`: tạo và theo dõi đơn chuyển khoản VietQR của chính tài khoản đăng nhập.
- `/api/webhooks/sepay`: nhận thông báo giao dịch xác thực từ SePay và kích hoạt gói tự động.

## Lưu ý production

- Đổi `JWT_SECRET_KEY` thành chuỗi ngẫu nhiên tối thiểu 32 ký tự.
- Tạo Atlas Vector Search index tên `document_chunks_vector` trên trường `embedding` (768 chiều) nếu bật RAG vector.
- BackgroundTasks phù hợp MVP một instance. Khi scale nhiều worker, chuyển AI job sang hàng đợi bền vững như Celery/Arq + Redis.
- Nâng cấp trực tiếp qua `/api/subscription/upgrade` bị khóa mặc định. Gói chỉ được kích hoạt từ một đơn thanh toán SePay đã xác thực.
- Để bật thanh toán: đặt `PAYMENT_PROVIDER=sepay`, thông tin tài khoản nhận VietQR và `SEPAY_WEBHOOK_API_KEY` trên Render. Trong SePay, liên kết tài khoản ngân hàng, tạo webhook sự kiện **Có tiền vào** tới `https://<render-domain>/api/webhooks/sepay`, dùng API Key authentication và cấu hình lọc tiền tố `TSTP`.
- Không đưa API key SePay, thông tin ngân hàng riêng hoặc QR chứa dữ liệu nhạy cảm vào Git. Webhook kiểm tra API key, số tài khoản, số tiền chính xác, mã chuyển khoản riêng và id giao dịch chống gửi lại.
- Không commit `.env`, connection string, token hoặc private key vào repository.
