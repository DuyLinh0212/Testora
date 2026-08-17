# Testora Web

Giao diện Angular 20 cho Testora, thiết kế sáng, responsive và chỉ dùng font hệ thống không cần mua giấy phép.

## Chạy ứng dụng

```powershell
npm install
npm start
```

Mở `http://localhost:4200`. Development build dùng API `http://127.0.0.1:8000/api`; production build nhận public API URL từ biến `TESTORA_API_URL` và mặc định dùng `/api`.

## Chức năng

- Đăng ký, đăng nhập và refresh phiên tự động
- Dashboard tiến độ học tập
- Tải lên, xem và xóa tài liệu
- Tạo/import/quản lý bộ câu hỏi
- Tạo quiz, làm bài, xem kết quả và leaderboard
- Câu sai cần ôn lại và màn hình gói dịch vụ
- Layout desktop/mobile với focus state và reduced-motion

## Kiểm thử và build

```powershell
npm test -- --watch=false
npm run build
```

Build production dạng SPA nằm trong `dist/Testora_web/browser`.
