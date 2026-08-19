import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { errorCode, errorMessage, fieldErrors } from '../core/error-message';
import { currentPasswordError, identifierError } from '../core/field-validation';

type LoginField = 'identifier' | 'password';

const FIELD_ORDER: readonly LoginField[] = ['identifier', 'password'];

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-story">
        <a class="brand" routerLink="/" aria-label="Testora">
          <img src="assets/testora-logo.png" alt="Testora" />
        </a>
        <div>
          <p class="eyebrow">Tài liệu → câu hỏi → ghi nhớ</p>
          <h1>Mỗi tài liệu đều có thể trở thành một buổi ôn tập tốt.</h1>
          <p>Đưa bài học vào Testora, kiểm tra ngay điều bạn hiểu và quay lại đúng những câu còn sai.</p>
        </div>
        <div class="story-rail" aria-hidden="true">
          <div><i></i><span>Tải tài liệu</span></div>
          <div><i></i><span>Tạo bộ câu hỏi</span></div>
          <div><i></i><span>Làm quiz và xem giải thích</span></div>
        </div>
      </section>

      <section class="auth-panel">
        <form class="auth-form" novalidate (ngSubmit)="submit()">
          <div>
            <p class="eyebrow">Chào bạn quay lại</p>
            <h2>Tiếp tục phiên học</h2>
            <p>Dùng email hoặc tên người dùng đã đăng ký.</p>
          </div>
          @if (error()) { <div class="message message-error" role="alert">{{ error() }}</div> }
          <div class="field" [class.invalid]="shown().identifier || credentialsRejected()">
            <label for="identifier">Email hoặc tên người dùng</label>
            <input
              id="identifier"
              name="identifier"
              autocomplete="username"
              required
              [ngModel]="identifier()"
              (ngModelChange)="edit('identifier', $event)"
              (blur)="touch('identifier')"
              [attr.aria-invalid]="shown().identifier ? 'true' : null"
              [attr.aria-describedby]="shown().identifier ? 'identifier-error' : null"
            />
            @if (shown().identifier) {
              <p class="field-error" id="identifier-error">{{ shown().identifier }}</p>
            }
          </div>
          <div class="field" [class.invalid]="shown().password || credentialsRejected()">
            <label for="password">Mật khẩu</label>
            <div class="control">
              <input
                id="password"
                name="password"
                autocomplete="current-password"
                required
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
          <button class="btn btn-primary submit" type="submit" [disabled]="loading()">
            {{ loading() ? 'Đang đăng nhập…' : 'Đăng nhập' }}
          </button>
          <p class="switch">Chưa có tài khoản? <a routerLink="/register">Tạo tài khoản miễn phí</a></p>
        </form>
      </section>
    </main>
  `,
  styles: `
    .auth-page { display: grid; min-height: 100dvh; grid-template-columns: minmax(0, 1.05fr) minmax(420px, .95fr); background: #fff; }
    .auth-story { position: relative; display: flex; min-height: 100%; flex-direction: column; justify-content: space-between; overflow: hidden; padding: clamp(2rem, 6vw, 5.5rem); background: #edf4ff; }
    .auth-story::after { position: absolute; right: -9rem; bottom: -8rem; width: 28rem; height: 28rem; border: 5rem solid rgba(36,87,230,.07); border-radius: 50%; content: ''; }
    .brand { z-index: 1; display: block; width: fit-content; text-decoration: none; }
    .brand img { display: block; width: clamp(140px, 15vw, 180px); height: auto; }
    .auth-story h1 { max-width: 700px; font-size: clamp(2.6rem, 5vw, 5.4rem); }
    .auth-story p { max-width: 640px; font-size: 1.05rem; }
    .story-rail { position: relative; z-index: 1; display: flex; gap: .35rem; }
    .story-rail div { display: grid; min-width: 0; flex: 1; gap: .5rem; color: #53627a; font-size: .75rem; font-weight: 700; }
    .story-rail i { height: 5px; border-radius: 999px; background: #cbdaf5; }
    .story-rail div:first-child i { background: var(--cobalt); }
    .auth-panel { display: grid; place-items: center; padding: 2rem; }
    .auth-form { display: grid; width: min(420px, 100%); gap: 1.15rem; }
    .auth-form h2 { margin: 0 0 .45rem; font-size: 2rem; }
    .auth-form p { margin-bottom: 0; }
    .submit { width: 100%; min-height: 48px; margin-top: .25rem; }
    .switch { text-align: center; }
    .switch a { color: var(--cobalt); font-weight: 750; }
    @media (max-width: 820px) { .auth-page { grid-template-columns: 1fr; } .auth-story { display: none; } .auth-panel { min-height: 100dvh; padding: 1.25rem; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly identifier = signal('');
  readonly password = signal('');
  readonly passwordVisible = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Máy chủ đã từ chối cặp thông tin đăng nhập: tô đỏ cả hai ô, không đoán ô nào sai. */
  readonly credentialsRejected = signal(false);

  private readonly touched = signal<Record<LoginField, boolean>>({
    identifier: false,
    password: false,
  });
  private readonly submitted = signal(false);
  private readonly serverErrors = signal<Record<string, string>>({});

  private readonly errors = computed(() => ({
    identifier: identifierError(this.identifier()) || this.serverErrors()['identifier'] || '',
    password: currentPasswordError(this.password()) || this.serverErrors()['password'] || '',
  }));

  /** Chỉ hiện lỗi sau khi người dùng rời ô đó hoặc đã bấm Đăng nhập. */
  readonly shown = computed(() => {
    const errors = this.errors();
    const touched = this.touched();
    const submitted = this.submitted();
    return {
      identifier: touched.identifier || submitted ? errors.identifier : '',
      password: touched.password || submitted ? errors.password : '',
    };
  });

  edit(field: LoginField, value: string): void {
    if (field === 'identifier') this.identifier.set(value);
    else this.password.set(value);
    this.credentialsRejected.set(false);
    this.error.set('');
    if (this.serverErrors()[field]) {
      this.serverErrors.update((current) => ({ ...current, [field]: '' }));
    }
  }

  touch(field: LoginField): void {
    this.touched.update((current) => ({ ...current, [field]: true }));
  }

  submit(): void {
    if (this.loading()) return;
    this.submitted.set(true);
    this.serverErrors.set({});
    this.credentialsRejected.set(false);
    this.error.set('');

    const errors = this.errors();
    const invalid = FIELD_ORDER.find((field) => errors[field]);
    if (invalid) {
      this.focus(invalid);
      return;
    }

    this.loading.set(true);
    this.auth
      .login(this.identifier().trim(), this.password())
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
    if (errorCode(error) !== 'INVALID_CREDENTIALS') return;
    // Sai email/tên hoặc mật khẩu: giữ nguyên dữ liệu, chọn sẵn mật khẩu để nhập lại.
    this.credentialsRejected.set(true);
    const input = document.getElementById('password');
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  private focus(field: LoginField): void {
    document.getElementById(field)?.focus();
  }
}
