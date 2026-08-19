import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { errorCode, errorMessage, fieldErrors } from '../core/error-message';
import {
  emailError,
  newPasswordError,
  termsError,
  usernameError,
} from '../core/field-validation';

type RegisterField = 'username' | 'email' | 'password' | 'terms';

const FIELD_ORDER: readonly RegisterField[] = ['username', 'email', 'password', 'terms'];

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <main class="register-page">
      <a class="brand" routerLink="/login" aria-label="Testora">
        <img src="assets/testora-logo.png" alt="Testora" />
      </a>
      <section class="register-card">
        <div class="intro">
          <p class="eyebrow">Bắt đầu với gói Free</p>
          <h1>Tạo không gian học của bạn.</h1>
          <p>Một lượt tạo AI mỗi ngày, 3 tài liệu đang lưu và toàn bộ quiz bạn đã tạo.</p>
        </div>
        <form novalidate (ngSubmit)="submit()">
          @if (error()) { <div class="message message-error" role="alert">{{ error() }}</div> }
          <div class="grid grid-2">
            <div class="field" [class.invalid]="shown().username || accountTaken()">
              <label for="username">Tên người dùng</label>
              <input
                id="username"
                name="username"
                autocomplete="username"
                required
                minlength="3"
                [ngModel]="username()"
                (ngModelChange)="edit('username', $event)"
                (blur)="touch('username')"
                [attr.aria-invalid]="shown().username ? 'true' : null"
                [attr.aria-describedby]="shown().username ? 'username-error' : null"
              />
              @if (shown().username) {
                <p class="field-error" id="username-error">{{ shown().username }}</p>
              }
            </div>
            <div class="field" [class.invalid]="shown().email || accountTaken()">
              <label for="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autocomplete="email"
                required
                [ngModel]="email()"
                (ngModelChange)="edit('email', $event)"
                (blur)="touch('email')"
                [attr.aria-invalid]="shown().email ? 'true' : null"
                [attr.aria-describedby]="shown().email ? 'email-error' : null"
              />
              @if (shown().email) {
                <p class="field-error" id="email-error">{{ shown().email }}</p>
              }
            </div>
          </div>
          <div class="field" [class.invalid]="shown().password">
            <div class="row-between">
              <label for="password">Mật khẩu</label>
              <span class="hint">8–128 ký tự</span>
            </div>
            <div class="control">
              <input
                id="password"
                name="password"
                autocomplete="new-password"
                required
                minlength="8"
                [type]="passwordVisible() ? 'text' : 'password'"
                [ngModel]="password()"
                (ngModelChange)="edit('password', $event)"
                (blur)="touch('password')"
                [attr.aria-invalid]="shown().password ? 'true' : null"
                [attr.aria-describedby]="shown().password ? 'password-error' : null"
              />
              <button
                class="reveal"
                type="button"
                [attr.aria-pressed]="passwordVisible()"
                (click)="passwordVisible.set(!passwordVisible())"
              >
                {{ passwordVisible() ? 'Ẩn' : 'Hiện' }}
              </button>
            </div>
            @if (shown().password) {
              <p class="field-error" id="password-error">{{ shown().password }}</p>
            }
          </div>
          <div class="terms">
            <label class="agree" [class.invalid]="shown().terms">
              <input
                id="terms"
                type="checkbox"
                name="terms"
                [ngModel]="accepted()"
                (ngModelChange)="edit('terms', $event)"
                [attr.aria-invalid]="shown().terms ? 'true' : null"
                [attr.aria-describedby]="shown().terms ? 'terms-error' : null"
              />
              <span>Tôi đồng ý lưu dữ liệu học tập cần thiết để Testora vận hành.</span>
            </label>
            @if (shown().terms) {
              <p class="field-error" id="terms-error">{{ shown().terms }}</p>
            }
          </div>
          <button class="btn btn-primary" type="submit" [disabled]="loading()">
            {{ loading() ? 'Đang tạo…' : 'Tạo tài khoản' }}
          </button>
          <p class="switch">Đã có tài khoản? <a routerLink="/login">Đăng nhập</a></p>
        </form>
      </section>
    </main>
  `,
  styles: `
    .register-page { min-height: 100dvh; padding: clamp(1.25rem, 4vw, 3rem); background: linear-gradient(135deg, #f7fafc 50%, #edf4ff 50%); }
    .brand { display: block; width: fit-content; text-decoration: none; }
    .brand img { display: block; width: clamp(140px, 15vw, 180px); height: auto; }
    .register-card { display: grid; width: min(940px, 100%); grid-template-columns: .85fr 1.15fr; gap: clamp(2rem, 6vw, 5rem); margin: clamp(3rem, 8vh, 6rem) auto 0; padding: clamp(1.3rem, 4vw, 3rem); border: 1px solid var(--line); border-radius: 28px; background: rgba(255,255,255,.95); box-shadow: var(--shadow); }
    .intro h1 { font-size: clamp(2.2rem, 4vw, 3.8rem); }
    form { display: grid; gap: 1rem; align-content: start; }
    .grid-2 .field { align-content: start; }
    form .btn { min-height: 48px; }
    .hint { color: var(--muted); font-size: .72rem; }
    .terms { display: grid; gap: .45rem; }
    .agree { display: flex; align-items: flex-start; gap: .6rem; color: var(--muted); font-size: .82rem; line-height: 1.45; }
    .agree input { margin-top: .2rem; accent-color: var(--cobalt); }
    .agree.invalid { color: #a92e39; }
    .agree.invalid input { accent-color: var(--coral); outline: 3px solid rgba(232,91,101,.22); outline-offset: 2px; }
    .switch { margin: 0; text-align: center; }
    .switch a { color: var(--cobalt); font-weight: 750; }
    @media (max-width: 760px) { .register-card { grid-template-columns: 1fr; margin-top: 2rem; } .grid-2 { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly username = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly accepted = signal(false);
  readonly passwordVisible = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Máy chủ báo trùng (409) nhưng không nói trùng email hay tên: tô đỏ cả hai ô. */
  readonly accountTaken = signal(false);

  private readonly touched = signal<Record<RegisterField, boolean>>({
    username: false,
    email: false,
    password: false,
    terms: false,
  });
  private readonly submitted = signal(false);
  private readonly serverErrors = signal<Record<string, string>>({});

  private readonly errors = computed(() => ({
    username: usernameError(this.username()) || this.serverErrors()['username'] || '',
    email: emailError(this.email()) || this.serverErrors()['email'] || '',
    password: newPasswordError(this.password()) || this.serverErrors()['password'] || '',
    terms: termsError(this.accepted()),
  }));

  /** Chỉ hiện lỗi sau khi người dùng rời ô đó hoặc đã bấm Tạo tài khoản. */
  readonly shown = computed(() => {
    const errors = this.errors();
    const touched = this.touched();
    const submitted = this.submitted();
    const visible = (field: RegisterField) => (touched[field] || submitted ? errors[field] : '');
    return {
      username: visible('username'),
      email: visible('email'),
      password: visible('password'),
      terms: visible('terms'),
    };
  });

  edit(field: RegisterField, value: string | boolean): void {
    if (field === 'terms') this.accepted.set(Boolean(value));
    else if (field === 'username') this.username.set(String(value));
    else if (field === 'email') this.email.set(String(value));
    else this.password.set(String(value));

    // Checkbox không có thao tác rời ô, nên đánh dấu ngay khi người dùng bật/tắt.
    if (field === 'terms') this.touch(field);
    this.accountTaken.set(false);
    this.error.set('');
    if (this.serverErrors()[field]) {
      this.serverErrors.update((current) => ({ ...current, [field]: '' }));
    }
  }

  touch(field: RegisterField): void {
    this.touched.update((current) => ({ ...current, [field]: true }));
  }

  submit(): void {
    if (this.loading()) return;
    this.submitted.set(true);
    this.serverErrors.set({});
    this.accountTaken.set(false);
    this.error.set('');

    const errors = this.errors();
    const invalid = FIELD_ORDER.find((field) => errors[field]);
    if (invalid) {
      this.focus(invalid);
      return;
    }

    this.loading.set(true);
    this.auth
      .register(this.email().trim(), this.username().trim(), this.password())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (error: unknown) => this.handleFailure(error),
      });
  }

  private handleFailure(error: unknown): void {
    const perField = fieldErrors(error);
    this.serverErrors.set(perField);
    this.error.set(errorMessage(error));

    const invalid = FIELD_ORDER.find((field) => perField[field]);
    if (invalid) {
      this.focus(invalid);
      return;
    }
    if (errorCode(error) === 'ACCOUNT_ALREADY_EXISTS') {
      this.accountTaken.set(true);
      this.focus('email');
    }
  }

  private focus(field: RegisterField): void {
    document.getElementById(field)?.focus();
  }
}
