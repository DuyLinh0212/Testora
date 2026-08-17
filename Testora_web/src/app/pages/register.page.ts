import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/error-message';

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
        <form (ngSubmit)="submit()">
          @if (error()) { <div class="message message-error" role="alert">{{ error() }}</div> }
          <div class="grid grid-2">
            <div class="field"><label for="username">Tên người dùng</label><input id="username" name="username" [(ngModel)]="username" autocomplete="username" required minlength="3" /></div>
            <div class="field"><label for="email">Email</label><input id="email" name="email" [(ngModel)]="email" type="email" autocomplete="email" required /></div>
          </div>
          <div class="field"><label for="password">Mật khẩu</label><input id="password" name="password" [(ngModel)]="password" type="password" autocomplete="new-password" required minlength="8" /></div>
          <label class="agree"><input type="checkbox" name="terms" [(ngModel)]="accepted" /> <span>Tôi đồng ý lưu dữ liệu học tập cần thiết để Testora vận hành.</span></label>
          <button class="btn btn-primary" type="submit" [disabled]="loading() || !accepted">{{ loading() ? 'Đang tạo…' : 'Tạo tài khoản' }}</button>
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
    form .btn { min-height: 48px; }
    .agree { display: flex; align-items: flex-start; gap: .6rem; color: var(--muted); font-size: .82rem; line-height: 1.45; }
    .agree input { margin-top: .2rem; accent-color: var(--cobalt); }
    .switch { margin: 0; text-align: center; }
    .switch a { color: var(--cobalt); font-weight: 750; }
    @media (max-width: 760px) { .register-card { grid-template-columns: 1fr; margin-top: 2rem; } .grid-2 { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  email = '';
  username = '';
  password = '';
  accepted = false;
  readonly loading = signal(false);
  readonly error = signal('');

  submit(): void {
    if (!this.accepted || this.password.length < 8 || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.auth
      .register(this.email, this.username, this.password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (error) => this.error.set(errorMessage(error)),
      });
  }
}
