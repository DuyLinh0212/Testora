import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" routerLink="/dashboard" aria-label="Testora - Tổng quan">
          <span class="brand-mark">T</span>
          <span>
            <strong>Testora</strong>
            <small>Học qua từng câu hỏi</small>
          </span>
        </a>

        <nav class="learning-rail" aria-label="Điều hướng chính">
          <a routerLink="/dashboard" routerLinkActive="active">
            <span class="rail-dot"></span><span>Tổng quan</span>
          </a>
          <a routerLink="/documents" routerLinkActive="active">
            <span class="rail-dot"></span><span>Tài liệu</span>
          </a>
          <a routerLink="/question-banks" routerLinkActive="active">
            <span class="rail-dot"></span><span>Bộ câu hỏi</span>
          </a>
          <a routerLink="/quizzes" routerLinkActive="active">
            <span class="rail-dot"></span><span>Quiz</span>
          </a>
        </nav>

        <div class="sidebar-bottom">
          <a class="plan-link" routerLink="/pricing">
            <span class="plan-chip">{{ auth.user()?.currentPlan || 'FREE' }}</span>
            <span>Nâng giới hạn học tập</span>
          </a>
          <button class="profile" type="button" (click)="auth.logout()">
            <span class="avatar">{{ initial }}</span>
            <span><strong>{{ auth.user()?.username || 'Người học' }}</strong><small>Đăng xuất</small></span>
          </button>
        </div>
      </aside>

      <main class="content"><router-outlet /></main>

      <nav class="bottom-nav" aria-label="Điều hướng di động">
        <a routerLink="/dashboard" routerLinkActive="active">Tổng quan</a>
        <a routerLink="/documents" routerLinkActive="active">Tài liệu</a>
        <a routerLink="/question-banks" routerLinkActive="active">Câu hỏi</a>
        <a routerLink="/quizzes" routerLinkActive="active">Quiz</a>
      </nav>
    </div>
  `,
  styles: `
    .shell { min-height: 100dvh; }
    .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; display: flex; width: 238px; flex-direction: column; padding: 1.35rem 1rem; border-right: 1px solid var(--line); background: rgba(255,255,255,.92); backdrop-filter: blur(18px); }
    .brand { display: flex; align-items: center; gap: .75rem; padding: .2rem .35rem 1.4rem; text-decoration: none; }
    .brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 13px 13px 13px 4px; background: var(--cobalt); color: white; font-weight: 850; }
    .brand strong, .brand small { display: block; }
    .brand strong { font-size: 1.05rem; letter-spacing: -.02em; }
    .brand small { margin-top: .1rem; color: var(--muted); font-size: .7rem; }
    .learning-rail { position: relative; display: grid; gap: .28rem; padding: .4rem 0; }
    .learning-rail::before { position: absolute; top: 1.65rem; bottom: 1.65rem; left: 1.16rem; width: 1px; background: #cfdced; content: ''; }
    .learning-rail a { position: relative; display: flex; align-items: center; gap: .8rem; min-height: 46px; padding: .65rem .75rem; border-radius: 12px; color: #53627a; font-weight: 680; text-decoration: none; }
    .learning-rail a:hover { background: #f4f7fb; color: var(--ink); }
    .learning-rail a.active { background: var(--surface-soft); color: var(--cobalt-dark); }
    .rail-dot { z-index: 1; width: 11px; height: 11px; border: 3px solid white; border-radius: 50%; background: #aab9cf; box-shadow: 0 0 0 1px #bdcadc; }
    a.active .rail-dot { background: var(--cobalt); box-shadow: 0 0 0 1px var(--cobalt); }
    .sidebar-bottom { display: grid; gap: .7rem; margin-top: auto; }
    .plan-link { display: grid; gap: .45rem; padding: .85rem; border-radius: 14px; background: #fff7dd; color: #5f4a0d; font-size: .77rem; font-weight: 680; text-decoration: none; }
    .plan-chip { width: fit-content; padding: .2rem .45rem; border-radius: 999px; background: var(--sun); color: #4f3b05; font-size: .65rem; }
    .profile { display: flex; width: 100%; align-items: center; gap: .65rem; padding: .6rem; border: 0; border-radius: 12px; background: transparent; color: var(--ink); text-align: left; }
    .profile:hover { background: #f4f7fb; }
    .profile strong, .profile small { display: block; max-width: 125px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .profile small { color: var(--muted); }
    .avatar { display: grid; width: 34px; height: 34px; flex: none; place-items: center; border-radius: 50%; background: #dff4f0; color: #0d7569; font-weight: 800; }
    .content { min-height: 100dvh; margin-left: 238px; }
    .bottom-nav { display: none; }
    @media (max-width: 760px) {
      .sidebar { display: none; }
      .content { margin-left: 0; }
      .bottom-nav { position: fixed; right: .75rem; bottom: .75rem; left: .75rem; z-index: 30; display: grid; grid-template-columns: repeat(4, 1fr); padding: .38rem; border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,255,.96); box-shadow: var(--shadow); backdrop-filter: blur(16px); }
      .bottom-nav a { padding: .7rem .25rem; border-radius: 12px; color: var(--muted); font-size: .7rem; font-weight: 720; text-align: center; text-decoration: none; }
      .bottom-nav a.active { background: var(--surface-soft); color: var(--cobalt); }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  readonly auth = inject(AuthService);

  get initial(): string {
    return (this.auth.user()?.username || 'T').charAt(0).toUpperCase();
  }

  ngOnInit(): void {
    this.auth.loadProfile().subscribe();
  }
}
