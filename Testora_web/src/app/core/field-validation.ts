/**
 * Luật kiểm tra hợp lệ ở client, giữ khớp với app/schemas.py của API:
 * - identifier: 3–255 ký tự
 * - username: 3–32 ký tự, chỉ chữ/số/. _ -
 * - password: 8–128 ký tự
 * Mỗi hàm trả về thông báo tiếng Việt, hoặc chuỗi rỗng khi trường đã hợp lệ.
 */
export type FieldErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const EMAIL_EXAMPLE = 'Email chưa đúng định dạng. Ví dụ: ban@truong.edu.vn';

export function identifierError(value: string): string {
  const identifier = value.trim();
  if (!identifier) return 'Nhập email hoặc tên người dùng của bạn.';
  if (identifier.length < 3) return 'Email hoặc tên người dùng cần ít nhất 3 ký tự.';
  if (identifier.length > 255) return 'Email hoặc tên người dùng tối đa 255 ký tự.';
  if (identifier.includes('@') && !EMAIL_PATTERN.test(identifier)) return EMAIL_EXAMPLE;
  return '';
}

export function currentPasswordError(value: string): string {
  if (!value) return 'Nhập mật khẩu.';
  if (value.length > 128) return 'Mật khẩu tối đa 128 ký tự.';
  return '';
}

export function emailError(value: string): string {
  const email = value.trim();
  if (!email) return 'Nhập email của bạn.';
  if (!EMAIL_PATTERN.test(email)) return EMAIL_EXAMPLE;
  if (email.length > 255) return 'Email tối đa 255 ký tự.';
  return '';
}

export function usernameError(value: string): string {
  const username = value.trim();
  if (!username) return 'Chọn một tên người dùng.';
  if (username.length < 3) return 'Tên người dùng cần ít nhất 3 ký tự.';
  if (username.length > 32) return 'Tên người dùng tối đa 32 ký tự.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  }
  return '';
}

export function newPasswordError(value: string): string {
  if (!value) return 'Đặt mật khẩu cho tài khoản.';
  if (value.length < 8) return `Mật khẩu cần ít nhất 8 ký tự, hiện có ${value.length}.`;
  if (value.length > 128) return 'Mật khẩu tối đa 128 ký tự.';
  return '';
}

export function termsError(accepted: boolean): string {
  return accepted ? '' : 'Đánh dấu đồng ý để tạo tài khoản.';
}
