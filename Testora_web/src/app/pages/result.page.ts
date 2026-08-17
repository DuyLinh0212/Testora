import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { QuestionOption } from '../core/models';

interface ResultResponse {
  attemptId: string;
  quiz: { _id: string; title: string };
  attemptNumber: number;
  durationSeconds: number;
  result: { correct: number; wrong: number; unanswered: number; score: number };
  review: Array<{ questionId: string; content: string; options: QuestionOption[]; selectedAnswer: string | null; correctAnswer: string; isCorrect: boolean; explanation: string; topic?: { name: string } }>;
}

@Component({
  imports: [DecimalPipe, RouterLink],
  template: `
    <section class="page">
      @if (loading()) { <div class="skeleton"></div> }
      @else if (error()) { <div class="message message-error">{{ error() }}</div> }
      @else if (data(); as result) {
        <header class="result-hero card">
          <div class="score-ring"><strong>{{ result.result.score | number:'1.0-1' }}</strong><span>/ 10</span></div>
          <div><p class="eyebrow">Đã chấm xong · Lần {{ result.attemptNumber }}</p><h1>{{ result.quiz.title }}</h1><p>{{ result.result.correct }} đúng · {{ result.result.wrong }} sai · {{ result.result.unanswered }} chưa trả lời · {{ formatTime(result.durationSeconds) }}</p></div>
          <div class="hero-actions"><a class="btn btn-primary" [routerLink]="['/quizzes', result.quiz._id, 'play']">Làm lại</a><a class="btn btn-secondary" routerLink="/quizzes">Về Quiz</a></div>
        </header>

        <div class="review-head"><div><p class="eyebrow">Question review</p><h2>Hiểu vì sao mỗi đáp án đúng</h2></div><div class="legend"><span><i class="good"></i>Đúng</span><span><i class="bad"></i>Sai</span></div></div>
        <div class="review-list">
          @for (question of result.review; track question.questionId; let index = $index) {
            <article class="review card card-pad" [class.wrong]="!question.isCorrect">
              <div class="review-status"><strong>Câu {{ index + 1 }}</strong><span class="badge" [class.badge-success]="question.isCorrect" [class.badge-danger]="!question.isCorrect">{{ question.isCorrect ? 'Đúng' : 'Cần xem lại' }}</span></div>
              <h3>{{ question.content }}</h3>
              <div class="review-options">@for (option of question.options; track option.id) { <div [class.correct]="option.id === question.correctAnswer" [class.selected-wrong]="option.id === question.selectedAnswer && !question.isCorrect"><b>{{ option.id }}</b><span>{{ option.content }}</span>@if (option.id === question.correctAnswer) { <small>Đáp án đúng</small> } @else if (option.id === question.selectedAnswer) { <small>Bạn đã chọn</small> }</div> }</div>
              <div class="explain"><strong>Giải thích</strong><p>{{ question.explanation }}</p></div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .result-hero { display: grid; grid-template-columns: auto 1fr auto; gap: 1.3rem; align-items: center; padding: clamp(1.2rem,3vw,2rem); border-color: #a8ddd5; background: linear-gradient(100deg,#f2fbfa,#fff); }
    .score-ring { display: grid; width: 112px; height: 112px; place-items: center; align-content: center; border: 8px solid #bce9e2; border-radius: 50%; background: #fff; color: #0c7669; }
    .score-ring strong { font-size: 2.1rem; letter-spacing: -.06em; }
    .score-ring span { font-size: .72rem; }
    .result-hero p { margin: 0; }
    .hero-actions { display: grid; gap: .5rem; }
    .review-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin: 2rem 0 1rem; }
    .legend { display: flex; gap: .8rem; color: var(--muted); font-size: .75rem; }
    .legend span { display: flex; align-items: center; gap: .3rem; }
    .legend i { width: 8px; height: 8px; border-radius: 50%; }
    .good { background: var(--aqua); } .bad { background: var(--coral); }
    .review-list { display: grid; gap: 1rem; }
    .review { border-left: 4px solid var(--aqua); }
    .review.wrong { border-left-color: var(--coral); }
    .review-status { display: flex; align-items: center; justify-content: space-between; }
    .review h3 { margin: 1rem 0; line-height: 1.5; }
    .review-options { display: grid; grid-template-columns: repeat(2,1fr); gap: .5rem; }
    .review-options > div { display: grid; grid-template-columns: auto 1fr auto; gap: .55rem; padding: .7rem; border: 1px solid #e1e7ef; border-radius: 11px; color: #53627a; font-size: .8rem; }
    .review-options b { color: var(--cobalt); }
    .review-options small { color: var(--muted); }
    .review-options .correct { border-color: #89d0c5; background: #eefaf8; color: #215d56; }
    .review-options .selected-wrong { border-color: #efadb2; background: #fff3f4; color: #8b3038; }
    .explain { margin-top: .8rem; padding: .85rem; border-radius: 11px; background: #f6f8fb; }
    .explain p { margin: .3rem 0 0; font-size: .82rem; }
    @media (max-width: 700px) { .result-hero { grid-template-columns: auto 1fr; } .hero-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; } .review-options { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly data = signal<ResultResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  ngOnInit(): void { const id = this.route.snapshot.paramMap.get('id'); this.api.get<ResultResponse>(`/quiz-attempts/${id}/result`).subscribe({ next: (data) => { this.data.set(data); this.loading.set(false); }, error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); } }); }
  formatTime(seconds: number): string { return `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`; }
}
