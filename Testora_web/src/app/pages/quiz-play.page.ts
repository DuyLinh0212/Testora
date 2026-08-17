import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { Question } from '../core/models';

interface StartResponse {
  attemptId: string;
  quiz: { _id: string; title: string; durationMinutes: number };
  questions: Question[];
  startedAt: string;
}

@Component({
  imports: [FormsModule],
  template: `
    <section class="quiz-page">
      @if (loading()) { <div class="loading-card card"><div class="skeleton"></div><p>Đang chuẩn bị câu hỏi an toàn, không kèm đáp án…</p></div> }
      @else if (error()) { <div class="message message-error">{{ error() }}</div> }
      @else if (attempt(); as current) {
        <header class="quiz-head"><div><p class="eyebrow">Lượt làm đang diễn ra</p><h1>{{ current.quiz.title }}</h1></div><div class="timer" [class.danger]="secondsLeft() < 60"><span>Còn lại</span><strong class="mono">{{ formatTime(secondsLeft()) }}</strong></div></header>
        <div class="quiz-progress"><i [style.width.%]="answeredPercent()"></i></div>
        <div class="quiz-layout">
          <main class="questions">
            @for (question of current.questions; track question._id; let index = $index) {
              <article class="question card card-pad" [id]="'question-' + index">
                <div class="question-label"><span>Câu {{ index + 1 }}</span><small>{{ question.topic?.name || 'Tổng quan' }}</small></div>
                <h2>{{ question.content }}</h2>
                <div class="answers">@for (option of question.options; track option.id) { <label [class.selected]="answers[question._id] === option.id"><input type="radio" [name]="question._id" [value]="option.id" [(ngModel)]="answers[question._id]" /><b>{{ option.id }}</b><span>{{ option.content }}</span></label> }</div>
              </article>
            }
          </main>
          <aside class="navigator card card-pad"><h3>Tiến độ</h3><p>{{ answeredCount() }} / {{ current.questions.length }} câu đã chọn</p><div class="question-dots">@for (question of current.questions; track question._id; let index = $index) { <a [href]="'#question-' + index" [class.done]="answers[question._id]">{{ index + 1 }}</a> }</div><button class="btn btn-primary" type="button" (click)="submit()" [disabled]="submitting()">{{ submitting() ? 'Đang chấm…' : 'Nộp bài' }}</button><small>Đáp án và giải thích chỉ xuất hiện sau khi nộp.</small></aside>
        </div>
      }
    </section>
  `,
  styles: `
    .quiz-page { width: min(1180px, 100%); margin: 0 auto; padding: 1.5rem clamp(1rem,3vw,2rem) 6rem; }
    .loading-card { width: min(520px, 100%); margin: 18vh auto 0; padding: 1.2rem; text-align: center; }
    .quiz-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .quiz-head h1 { font-size: clamp(1.6rem,3vw,2.3rem); }
    .timer { display: grid; min-width: 118px; padding: .65rem .85rem; border: 1px solid var(--line); border-radius: 14px; background: #fff; text-align: right; }
    .timer span { color: var(--muted); font-size: .7rem; }
    .timer strong { font-size: 1.25rem; }
    .timer.danger { border-color: #efb6ba; background: #fff3f4; color: #a72e38; }
    .quiz-progress { height: 6px; margin: 1rem 0; overflow: hidden; border-radius: 999px; background: #dfe6ef; }
    .quiz-progress i { display: block; height: 100%; background: var(--aqua); transition: width .2s ease; }
    .quiz-layout { display: grid; grid-template-columns: minmax(0,1fr) 240px; gap: 1rem; align-items: start; }
    .questions { display: grid; gap: 1rem; }
    .question-label { display: flex; align-items: center; justify-content: space-between; color: var(--cobalt); font-size: .75rem; font-weight: 760; }
    .question-label small { color: var(--muted); }
    .question h2 { margin: 1rem 0; font-size: 1.12rem; line-height: 1.55; }
    .answers { display: grid; gap: .55rem; }
    .answers label { display: grid; grid-template-columns: auto auto 1fr; gap: .7rem; align-items: center; padding: .8rem; border: 1px solid #dfe6ef; border-radius: 12px; color: #46566e; cursor: pointer; }
    .answers label:hover { border-color: #a9bbd7; background: #fbfcff; }
    .answers label.selected { border-color: var(--cobalt); background: var(--surface-soft); color: var(--ink); }
    .answers input { position: absolute; opacity: 0; }
    .answers b { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 9px; background: #eef2f7; color: var(--cobalt); }
    .answers label.selected b { background: var(--cobalt); color: #fff; }
    .navigator { position: sticky; top: 1rem; }
    .navigator p, .navigator > small { font-size: .75rem; }
    .question-dots { display: grid; grid-template-columns: repeat(5,1fr); gap: .4rem; margin: .9rem 0 1rem; }
    .question-dots a { display: grid; aspect-ratio: 1; place-items: center; border: 1px solid var(--line); border-radius: 9px; color: var(--muted); font-size: .72rem; text-decoration: none; }
    .question-dots a.done { border-color: #8ed3c9; background: #e5f8f4; color: #0c7669; font-weight: 750; }
    .navigator .btn { width: 100%; }
    @media (max-width: 800px) { .quiz-layout { grid-template-columns: 1fr; } .navigator { position: static; order: -1; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizPlayPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly attempt = signal<StartResponse | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly secondsLeft = signal(0);
  answers: Record<string, string> = {};
  private timerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const quizId = this.route.snapshot.paramMap.get('id');
    this.api.post<StartResponse>(`/quizzes/${quizId}/start`, {}).subscribe({ next: (response) => { this.attempt.set(response); this.secondsLeft.set(response.quiz.durationMinutes * 60); this.loading.set(false); this.timerId = setInterval(() => { this.secondsLeft.update((value) => Math.max(0, value - 1)); if (this.secondsLeft() === 0) this.submit(); }, 1000); }, error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); } });
  }
  ngOnDestroy(): void { if (this.timerId) clearInterval(this.timerId); }
  answeredCount(): number { return Object.values(this.answers).filter(Boolean).length; }
  answeredPercent(): number { const total = this.attempt()?.questions.length || 1; return this.answeredCount() / total * 100; }
  formatTime(seconds: number): string { return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
  submit(): void {
    const attempt = this.attempt(); if (!attempt || this.submitting()) return;
    if (this.secondsLeft() > 0 && !window.confirm(`Nộp bài với ${this.answeredCount()}/${attempt.questions.length} câu đã chọn?`)) return;
    this.submitting.set(true); if (this.timerId) clearInterval(this.timerId);
    const answers = attempt.questions.map((question) => ({ questionId: question._id, selectedAnswer: this.answers[question._id] || null, timeSpentSeconds: 0 }));
    this.api.post(`/quiz-attempts/${attempt.attemptId}/submit`, { answers }).subscribe({ next: () => void this.router.navigate(['/attempts', attempt.attemptId, 'result']), error: (error) => { this.error.set(errorMessage(error)); this.submitting.set(false); } });
  }
}

