import { HttpErrorResponse } from '@angular/common/http';
import type { FieldErrors } from './field-validation';

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error?.error;
    if (payload?.message) {
      return payload.resolution ? `${payload.message} ${payload.resolution}` : payload.message;
    }
  }
  return 'Không thể hoàn tất yêu cầu. Kiểm tra kết nối API rồi thử lại.';
}

/** Mã lỗi do API trả về (ví dụ INVALID_CREDENTIALS), hoặc chuỗi rỗng nếu không có. */
export function errorCode(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const code = error.error?.error?.code;
    if (typeof code === 'string') return code;
  }
  return '';
}

const DETAIL_MESSAGES: Record<string, string> = {
  missing: 'Trường này chưa được điền.',
  string_too_short: 'Giá trị này quá ngắn.',
  string_too_long: 'Giá trị này quá dài.',
  string_pattern_mismatch: 'Giá trị này chứa ký tự không được phép.',
  value_error: 'Giá trị này chưa đúng định dạng.',
};

/**
 * Chuyển details của lỗi 422 (VALIDATION_ERROR từ FastAPI) thành lỗi theo từng trường,
 * để thông báo hiện ngay dưới ô nhập thay vì chỉ nằm trong banner chung.
 */
export function fieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof HttpErrorResponse)) return {};
  const details = error.error?.error?.details;
  if (!Array.isArray(details)) return {};

  const mapped: FieldErrors = {};
  for (const detail of details) {
    const location: unknown[] = Array.isArray(detail?.loc) ? detail.loc : [];
    const field = [...location]
      .reverse()
      .find((part): part is string => typeof part === 'string' && part !== 'body');
    if (!field || mapped[field]) continue;
    mapped[field] = DETAIL_MESSAGES[detail?.type as string] ?? 'Giá trị này chưa hợp lệ.';
  }
  return mapped;
}
