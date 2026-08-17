import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { Quiz } from '../core/models';

interface LeaderboardRow {
  rank: number;
  username: string;
  score: number;
  correct: number;
  total: number;
  completionTimeSeconds: number;
  attemptCount: number;
}

@Component({
  imports: [FormsModule, DecimalPipe],
  template: `
    <section class="page">
      <header class="page-head">
        <div><p class="eyebrow">Đích đến của learning rail</p><h1>Quiz</h1><p>Làm lại, chia sẻ bằng mã và xem thành tích tốt nhất của từng người.</p></div>
        <form class="join" (ngSubmit)="join()"><label class="sr-only" for="share-code">Mã chia sẻ</label><input id="share-code" name="shareCode" [(ngModel)]="shareCode" class="input mono" placeholder="TST-XXXXX" /><button class="btn btn-primary" type="submit">Mở mã</button></form>
      </header>
      @if (error()) { <div class="message message-error">{{ error() }}</div> }

      @if (loading()) { <div class="grid grid-2"><div class="skeleton"></div><div class="skeleton"></div></div> }
      @else if (quizzes().length) {
        <div class="quiz-grid">
          @for (quiz of quizzes(); track quiz._id) {
            <article class="quiz card card-pad">
              <div class="quiz-top"><span class="badge">{{ quiz.visibility }}</span><button class="more" type="button" (click)="remove(quiz)" aria-label="Xóa quiz">×</button></div>
              <div><h2>{{ quiz.title }}</h2><p>{{ quiz.description || 'Quiz được tạo từ bộ câu hỏi của bạn.' }}</p></div>
              <div class="meta"><div><strong>{{ quiz.config.questionCount }}</strong><span>câu</span></div><div><strong>{{ quiz.config.durationMinutes }}</strong><span>phút</span></div><div><strong>{{ quiz.stats.averageScore | number:'1.0-1' }}</strong><span>điểm TB</span></div></div>
              <div class="share"><span class="mono">{{ quiz.shareCode }}</span><button type="button" (click)="copyCode(quiz.shareCode)">Sao chép</button></div>
              <div class="actions"><button class="btn btn-primary" type="button" (click)="play(quiz)">Bắt đầu làm</button><button class="btn btn-secondary" type="button" (click)="showLeaderboard(quiz)">Xếp hạng</button></div>
            </article>
          }
        </div>
      } @else {
        <div class="card empty"><div class="empty-mark">✓</div><h3>Chưa có quiz</h3><p>Mở một bộ câu hỏi và chọn “Tạo Quiz”.</p></div>
      }
    </section>

    @if (leaderboardQuiz(); as quiz) {
      <div class="dialog-backdrop" (click)="leaderboardQuiz.set(null)">
        <section class="dialog card" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
          <div class="row-between"><div><p class="eyebrow">Bảng xếp hạng</p><h2>{{ quiz.title }}</h2></div><button class="close" type="button" (click)="leaderboardQuiz.set(null)">×</button></div>
          @if (leaderboard().length) {
            <div class="leaderboard">@for (row of leaderboard(); track row.rank) { <div class="leader-row" [class.top]="row.rank <= 3"><strong>#{{ row.rank }}</strong><span>{{ row.username }}</span><b>{{ row.score | number:'1.0-1' }}</b><small>{{ row.correct }}/{{ row.total }} · {{ formatTime(row.completionTimeSeconds) }} · {{ row.attemptCount }} lượt</small></div> }</div>
          } @else { <div class="empty"><div class="empty-mark">#</div><h3>Chưa có thứ hạng</h3><p>Hãy là người đầu tiên hoàn thành quiz.</p></div> }
        </section>
      </div>
    }
  `,
  styles: `
    .join { display: flex; gap: .5rem; }
    .join input { width: 170px; text-transform: uppercase; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    .quiz-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .quiz { display: grid; gap: 1rem; }
    .quiz-top { display: flex; justify-content: space-between; }
    .more, .close { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 50%; background: #f3f5f8; color: var(--muted); font-size: 1.1rem; }
    .quiz h2 { margin: 0; }
    .quiz p { min-height: 2.6rem; margin: .35rem 0 0; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; }
    .meta div { padding: .65rem; border-radius: 11px; background: #f6f8fb; }
    .meta strong, .meta span { display: block; }
    .meta strong { font-size: 1.1rem; }
    .meta span { color: var(--muted); font-size: .68rem; }
    .share { display: flex; align-items: center; justify-content: space-between; padding: .65rem .75rem; border: 1px dashed #b4c3d9; border-radius: 11px; background: #fbfcfe; }
    .share span { color: var(--cobalt-dark); font-size: .8rem; font-weight: 750; }
    .share button { border: 0; background: transparent; color: var(--cobalt); font-size: .72rem; font-weight: 750; }
    .actions { display: flex; gap: .5rem; }
    .actions .btn { flex: 1; }
    .dialog-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: rgba(22,35,58,.36); backdrop-filter: blur(5px); }
    .dialog { width: min(650px, 100%); max-height: 88dvh; overflow: auto; padding: 1.4rem; box-shadow: var(--shadow); }
    .leaderboard { display: grid; margin-top: 1rem; }
    .leader-row { display: grid; grid-template-columns: 46px 1fr auto; gap: .5rem .8rem; align-items: center; padding: .8rem; border-top: 1px solid #edf1f6; }
    .leader-row small { grid-column: 2 / -1; color: var(--muted); }
    .leader-row.top { border-radius: 12px; background: #fff9e7; }
    @media (max-width: 760px) { .quiz-grid { grid-template-columns: 1fr; } .join { width: 100%; } .join input { flex: 1; width: auto; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizzesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly quizzes = signal<Quiz[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly leaderboardQuiz = signal<Quiz | null>(null);
  readonly leaderboard = signal<LeaderboardRow[]>([]);
  shareCode = '';

  ngOnInit(): void { this.api.get<Quiz[]>('/quizzes').subscribe({ next: (items) => { this.quizzes.set(items); this.loading.set(false); }, error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); } }); }
  play(quiz: Quiz): void { void this.router.navigate(['/quizzes', quiz._id, 'play']); }
  join(): void { const code = this.shareCode.trim().toUpperCase(); if (!code) return; this.api.get<Quiz>(`/quizzes/share/${code}`).subscribe({ next: (quiz) => this.play(quiz), error: (error) => this.error.set(errorMessage(error)) }); }
  copyCode(code: string): void { void navigator.clipboard?.writeText(code); }
  remove(quiz: Quiz): void { if (!window.confirm(`Xóa quiz “${quiz.title}” và các lượt làm liên quan?`)) return; this.api.delete(`/quizzes/${quiz._id}`).subscribe({ next: () => this.quizzes.update((items) => items.filter((item) => item._id !== quiz._id)), error: (error) => this.error.set(errorMessage(error)) }); }
  showLeaderboard(quiz: Quiz): void { this.leaderboardQuiz.set(quiz); this.leaderboard.set([]); this.api.get<LeaderboardRow[]>(`/quizzes/${quiz._id}/leaderboard`).subscribe({ next: (rows) => this.leaderboard.set(rows), error: (error) => this.error.set(errorMessage(error)) }); }
  formatTime(seconds: number): string { const minutes = Math.floor(seconds / 60); return `${minutes}:${String(seconds % 60).padStart(2, '0')}`; }
}

