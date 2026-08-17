import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { Question, QuestionBank, Quiz } from '../core/models';

@Component({
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page">
      <a class="back" routerLink="/question-banks">← Tất cả bộ câu hỏi</a>
      @if (bank(); as currentBank) {
        <header class="detail-head">
          <div><span class="badge badge-success">{{ currentBank.status }}</span><h1>{{ currentBank.name }}</h1><p>{{ currentBank.questionCount }} câu · nguồn {{ currentBank.source.originalDocumentName }}</p></div>
          <div class="row"><button class="btn btn-secondary" type="button" (click)="toggleAdd()">+ Thêm câu</button><button class="btn btn-primary" type="button" (click)="toggleQuiz()">Tạo Quiz</button></div>
        </header>
      }
      @if (error()) { <div class="message message-error">{{ error() }}</div> }

      @if (showQuiz() && bank(); as currentBank) {
        <form class="builder card card-pad" (ngSubmit)="createQuiz()">
          <div><p class="eyebrow">Quiz builder</p><h2>Chọn cách người học làm bài</h2></div>
          <div class="field"><label for="quiz-title">Tên quiz</label><input id="quiz-title" name="quizTitle" [(ngModel)]="quizTitle" required /></div>
          <div class="field"><label for="question-count">Số câu</label><input id="question-count" name="questionCount" [(ngModel)]="quizQuestionCount" type="number" min="1" [max]="currentBank.questionCount" /></div>
          <div class="field"><label for="duration">Thời gian (phút)</label><input id="duration" name="duration" [(ngModel)]="durationMinutes" type="number" min="1" max="300" /></div>
          <div class="field"><label for="visibility">Hiển thị</label><select id="visibility" name="visibility" [(ngModel)]="visibility"><option value="PRIVATE">Riêng tư</option><option value="UNLISTED">Có link</option><option value="PUBLIC">Công khai</option></select></div>
          <label class="check"><input name="leaderboard" type="checkbox" [(ngModel)]="leaderboardEnabled" /> Bật bảng xếp hạng</label>
          <button class="btn btn-primary" type="submit">Tạo quiz</button>
        </form>
      }

      @if (showAdd()) {
        <form class="manual card card-pad" (ngSubmit)="addQuestion()">
          <div class="manual-head"><div><p class="eyebrow">Câu hỏi thủ công</p><h2>Thêm một câu mới</h2></div><button class="btn btn-ghost" type="button" (click)="showAdd.set(false)">Đóng</button></div>
          <div class="field"><label for="content">Nội dung câu hỏi</label><textarea id="content" name="content" [(ngModel)]="newQuestion.content" required></textarea></div>
          <div class="option-grid">@for (option of newQuestion.options; track option.id) { <div class="field"><label [for]="'option-' + option.id">Lựa chọn {{ option.id }}</label><input [id]="'option-' + option.id" [name]="'option-' + option.id" [(ngModel)]="option.content" required /></div> }</div>
          <div class="grid grid-2"><div class="field"><label for="correct">Đáp án đúng</label><select id="correct" name="correct" [(ngModel)]="newQuestion.correctAnswer"><option>A</option><option>B</option><option>C</option><option>D</option></select></div><div class="field"><label for="topic">Chủ đề</label><input id="topic" name="topic" [(ngModel)]="newQuestion.topic" /></div></div>
          <div class="field"><label for="explanation">Giải thích</label><textarea id="explanation" name="explanation" [(ngModel)]="newQuestion.explanation" required></textarea></div>
          <button class="btn btn-primary" type="submit">Lưu câu hỏi</button>
        </form>
      }

      @if (loading()) { <div class="stack"><div class="skeleton"></div><div class="skeleton"></div></div> }
      @else {
        <div class="question-list">
          @for (question of questions(); track question._id; let index = $index) {
            <article class="question card card-pad">
              <div class="question-no">{{ index + 1 }}</div>
              <div class="question-body"><div class="row"><span class="badge">{{ question.topic?.name || 'Tổng quan' }}</span><span class="badge badge-warn">{{ question.difficulty }}</span></div><h2>{{ question.content }}</h2><div class="options">@for (option of question.options; track option.id) { <div [class.correct]="option.id === question.correctAnswer"><b>{{ option.id }}</b><span>{{ option.content }}</span></div> }</div>@if (question.explanation) { <p class="explanation"><strong>Giải thích:</strong> {{ question.explanation }}</p> }</div>
              <button class="delete" type="button" (click)="removeQuestion(question)" aria-label="Xóa câu hỏi">×</button>
            </article>
          } @empty { <div class="card empty"><div class="empty-mark">?</div><h3>Bộ này chưa có câu hỏi</h3><p>Thêm thủ công hoặc tạo thêm bằng AI từ tài liệu.</p></div> }
        </div>
      }
    </section>
  `,
  styles: `
    .back { display: inline-block; margin-bottom: 1.4rem; color: var(--cobalt); font-size: .8rem; font-weight: 750; text-decoration: none; }
    .detail-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.2rem; }
    .detail-head h1 { margin-top: .6rem; }
    .detail-head p { margin: 0; }
    .builder { display: grid; grid-template-columns: 1.2fr 1fr .65fr .75fr auto auto; gap: .8rem; align-items: end; margin-bottom: 1rem; border-color: #b9caef; background: #f7f9ff; }
    .builder h2 { margin: 0; }
    .check { display: flex; min-height: 44px; align-items: center; gap: .45rem; color: var(--muted); font-size: .76rem; }
    .check input { accent-color: var(--cobalt); }
    .manual { display: grid; gap: 1rem; margin-bottom: 1rem; }
    .manual-head { display: flex; justify-content: space-between; }
    .option-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .8rem; }
    .question-list { display: grid; gap: .85rem; }
    .question { position: relative; display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; }
    .question-no { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 12px; background: var(--surface-soft); color: var(--cobalt); font: 750 .78rem 'Cascadia Mono', Consolas, monospace; }
    .question-body h2 { margin: .85rem 0; font-size: 1.05rem; line-height: 1.5; }
    .options { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem; }
    .options div { display: flex; gap: .65rem; padding: .65rem .75rem; border: 1px solid #e4eaf2; border-radius: 11px; color: #516078; font-size: .82rem; }
    .options b { color: var(--cobalt); }
    .options div.correct { border-color: #9dd9d0; background: #f0fbf9; color: #1d625a; }
    .explanation { margin: .8rem 0 0; padding: .7rem .8rem; border-radius: 10px; background: #f6f8fb; font-size: .8rem; }
    .delete { width: 32px; height: 32px; border: 0; border-radius: 50%; background: #fff2f3; color: var(--coral); font-size: 1.15rem; }
    @media (max-width: 1050px) { .builder { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 700px) { .detail-head { align-items: flex-start; flex-direction: column; } .builder, .option-grid, .grid-2 { grid-template-columns: 1fr; } .question { grid-template-columns: auto 1fr; } .delete { position: absolute; top: .8rem; right: .8rem; } .options { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionBankDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly bank = signal<QuestionBank | null>(null);
  readonly questions = signal<Question[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showQuiz = signal(false);
  readonly showAdd = signal(false);
  readonly bankId = this.route.snapshot.paramMap.get('id') || '';
  quizTitle = '';
  quizQuestionCount = 10;
  durationMinutes = 30;
  visibility: Quiz['visibility'] = 'UNLISTED';
  leaderboardEnabled = true;
  newQuestion = this.emptyQuestion();

  ngOnInit(): void {
    forkJoin({ bank: this.api.get<QuestionBank>(`/question-banks/${this.bankId}`), questions: this.api.get<Question[]>(`/question-banks/${this.bankId}/questions`) }).subscribe({
      next: ({ bank, questions }) => { this.bank.set(bank); this.questions.set(questions); this.quizTitle = `Quiz ${bank.name}`; this.quizQuestionCount = Math.min(10, bank.questionCount); this.loading.set(false); },
      error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); },
    });
  }

  toggleAdd(): void { this.showAdd.set(!this.showAdd()); }
  toggleQuiz(): void { this.showQuiz.set(!this.showQuiz()); }

  createQuiz(): void {
    this.api.post<Quiz>('/quizzes', { questionBankId: this.bankId, title: this.quizTitle, description: '', visibility: this.visibility, config: { questionCount: this.quizQuestionCount, durationMinutes: this.durationMinutes, shuffleQuestions: true, shuffleOptions: true, leaderboardEnabled: this.leaderboardEnabled } }).subscribe({ next: () => void this.router.navigateByUrl('/quizzes'), error: (error) => this.error.set(errorMessage(error)) });
  }

  addQuestion(): void {
    const payload = { content: this.newQuestion.content, options: this.newQuestion.options, correctAnswer: this.newQuestion.correctAnswer, explanation: this.newQuestion.explanation, difficulty: 'medium', questionType: 'multiple_choice', topic: { name: this.newQuestion.topic || 'Tổng quan' } };
    this.api.post<Question>(`/question-banks/${this.bankId}/questions`, payload).subscribe({ next: (question) => { this.questions.update((items) => [...items, question]); this.bank.update((bank) => bank ? { ...bank, questionCount: bank.questionCount + 1 } : null); this.newQuestion = this.emptyQuestion(); this.showAdd.set(false); }, error: (error) => this.error.set(errorMessage(error)) });
  }

  removeQuestion(question: Question): void {
    if (!window.confirm('Xóa câu hỏi này khỏi bộ?')) return;
    this.api.delete(`/questions/${question._id}`).subscribe({ next: () => { this.questions.update((items) => items.filter((item) => item._id !== question._id)); this.bank.update((bank) => bank ? { ...bank, questionCount: Math.max(0, bank.questionCount - 1) } : null); }, error: (error) => this.error.set(errorMessage(error)) });
  }

  private emptyQuestion() { return { content: '', options: ['A', 'B', 'C', 'D'].map((id) => ({ id, content: '' })), correctAnswer: 'A', topic: '', explanation: '' }; }
}
