import { HttpErrorResponse } from '@angular/common/http';

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const payload = error.error?.error;
    if (payload?.message) {
      return payload.resolution ? `${payload.message} ${payload.resolution}` : payload.message;
    }
  }
  return 'Không thể hoàn tất yêu cầu. Kiểm tra kết nối API rồi thử lại.';
}
