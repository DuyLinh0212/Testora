import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/error-message';

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-page">
      <section class="auth-story">
        <a class="brand" routerLink="/"><span>T</span> Testora</a>
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
        <form class="auth-form" (ngSubmit)="submit()">
          <div>
            <p class="eyebrow">Chào bạn quay lại</p>
            <h2>Tiếp tục phiên học</h2>
            <p>Dùng email hoặc tên người dùng đã đăng ký.</p>
          </div>
          @if (error()) { <div class="message message-error" role="alert">{{ error() }}</div> }
          <div class="field">
            <label for="identifier">Email hoặc tên người dùng</label>
            <input id="identifier" name="identifier" [(ngModel)]="identifier" autocomplete="username" required />
          </div>
          <div class="field">
            <div class="row-between"><label for="password">Mật khẩu</label><span class="hint">Tối thiểu 8 ký tự</span></div>
            <input id="password" name="password" [(ngModel)]="password" type="password" autocomplete="current-password" required />
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
    .brand { display: flex; z-index: 1; align-items: center; gap: .65rem; color: var(--ink); font-size: 1.1rem; font-weight: 800; text-decoration: none; }
    .brand span { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 12px 12px 12px 4px; background: var(--cobalt); color: white; }
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
    .hint { color: var(--muted); font-size: .72rem; }
    .switch { text-align: center; }
    .switch a { color: var(--cobalt); font-weight: 750; }
    @media (max-width: 820px) { .auth-page { grid-template-columns: 1fr; } .auth-story { display: none; } .auth-panel { min-height: 100dvh; padding: 1.25rem; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  identifier = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal('');

  submit(): void {
    if (!this.identifier || !this.password || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.auth
      .login(this.identifier, this.password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/dashboard'),
        error: (error) => this.error.set(errorMessage(error)),
      });
  }
}

