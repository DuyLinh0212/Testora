import {
  currentPasswordError,
  emailError,
  identifierError,
  newPasswordError,
  termsError,
  usernameError,
} from './field-validation';

describe('field-validation', () => {
  describe('identifierError', () => {
    it('yêu cầu nhập khi để trống', () => {
      expect(identifierError('   ')).toBe('Nhập email hoặc tên người dùng của bạn.');
    });

    it('từ chối giá trị ngắn hơn 3 ký tự', () => {
      expect(identifierError('ab')).toContain('ít nhất 3 ký tự');
    });

    it('chỉ kiểm tra định dạng email khi có ký tự @', () => {
      expect(identifierError('ban@truong')).toContain('định dạng');
      expect(identifierError('ban@truong.edu.vn')).toBe('');
      expect(identifierError('nguoihoc01')).toBe('');
    });
  });

  describe('currentPasswordError', () => {
    it('chỉ bắt buộc không rỗng, không áp luật độ dài của đăng ký', () => {
      expect(currentPasswordError('')).toBe('Nhập mật khẩu.');
      expect(currentPasswordError('abc')).toBe('');
    });

    it('từ chối mật khẩu dài hơn 128 ký tự', () => {
      expect(currentPasswordError('a'.repeat(129))).toContain('tối đa 128');
    });
  });

  describe('emailError', () => {
    it('bắt buộc và kiểm tra định dạng', () => {
      expect(emailError('')).toBe('Nhập email của bạn.');
      expect(emailError('ban@truong')).toContain('định dạng');
      expect(emailError('ban@truong.edu.vn')).toBe('');
    });
  });

  describe('usernameError', () => {
    it('khớp luật 3–32 ký tự của API', () => {
      expect(usernameError('')).toBe('Chọn một tên người dùng.');
      expect(usernameError('ab')).toContain('ít nhất 3 ký tự');
      expect(usernameError('a'.repeat(33))).toContain('tối đa 32 ký tự');
      expect(usernameError('nguoi_hoc.01-a')).toBe('');
    });

    it('từ chối khoảng trắng và dấu tiếng Việt', () => {
      expect(usernameError('nguoi hoc')).toContain('Chỉ dùng chữ không dấu');
      expect(usernameError('nguờihọc')).toContain('Chỉ dùng chữ không dấu');
    });
  });

  describe('newPasswordError', () => {
    it('nói rõ còn thiếu bao nhiêu ký tự', () => {
      expect(newPasswordError('12345')).toBe('Mật khẩu cần ít nhất 8 ký tự, hiện có 5.');
      expect(newPasswordError('matkhau8ky')).toBe('');
    });
  });

  describe('termsError', () => {
    it('chỉ báo lỗi khi chưa đồng ý', () => {
      expect(termsError(false)).toBe('Đánh dấu đồng ý để tạo tài khoản.');
      expect(termsError(true)).toBe('');
    });
  });
});
