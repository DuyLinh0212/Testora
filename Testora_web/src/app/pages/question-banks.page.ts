import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { QuestionBank } from '../core/models';

@Component({
  imports: [DatePipe, RouterLink, FormsModule],
  template: `
    <section class="page">
      <header class="page-head">
        <div><p class="eyebrow">Nội dung học độc lập</p><h1>Bộ câu hỏi</h1><p>Chỉnh nội dung, thêm câu thủ công và dùng lại cho nhiều quiz.</p></div>
        <button class="btn btn-secondary" type="button" (click)="toggleImport()">{{ showImport() ? 'Đóng import' : 'Import file câu hỏi' }}</button>
      </header>

      @if (error()) { <div class="message message-error">{{ error() }}</div> }
      @if (showImport()) {
        <form class="import card card-pad" (ngSubmit)="importQuestions()">
          <div><span class="badge">PARSER FIRST</span><h2>Import câu hỏi có sẵn</h2><p>Testora nhận Câu 1 / Question 1 / 1. và lựa chọn A.–D. Gemini chỉ fallback khi cấu trúc phức tạp.</p></div>
          <div class="field"><label for="bank-name">Tên bộ câu hỏi</label><input id="bank-name" name="bankName" [(ngModel)]="bankName" placeholder="Ôn tập cuối kỳ" /></div>
          <label class="file-input" for="question-file"><input id="question-file" type="file" accept=".pdf,.docx,.txt" (change)="pickFile($event)" /><span>{{ importFile?.name || 'Chọn PDF, DOCX hoặc TXT' }}</span></label>
          <button class="btn btn-primary" type="submit" [disabled]="!importFile || importing()">{{ importing() ? 'Đang nhận diện câu hỏi…' : 'Tạo bộ câu hỏi' }}</button>
        </form>
      }

      @if (loading()) {
        <div class="grid grid-3"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (banks().length) {
        <div class="bank-grid">
          @for (bank of banks(); track bank._id) {
            <article class="bank card">
              <div class="bank-top"><span class="origin">{{ bank.source.type === 'QUESTION_IMPORT' ? 'IMPORT' : 'AI' }}</span><span class="badge" [class.badge-success]="bank.status === 'READY'" [class.badge-danger]="bank.status === 'FAILED'">{{ bank.status }}</span></div>
              <div><h2>{{ bank.name }}</h2><p>{{ bank.source.originalDocumentName }}</p></div>
              <div class="question-count"><strong>{{ bank.questionCount }}</strong><span>câu hỏi</span></div>
              <div class="bank-foot"><small>{{ bank.createdAt | date:'dd/MM/yyyy' }}</small><a class="btn btn-secondary" [routerLink]="['/question-banks', bank._id]">Mở bộ câu hỏi →</a></div>
            </article>
          }
        </div>
      } @else {
        <div class="card empty"><div class="empty-mark">?</div><h3>Chưa có bộ câu hỏi</h3><p>Tạo từ một tài liệu hoặc import file câu hỏi có sẵn.</p><a class="btn btn-primary" routerLink="/documents">Đi tới Tài liệu</a></div>
      }
    </section>
  `,
  styles: `
    .import { display: grid; grid-template-columns: 1.3fr 1fr 1fr auto; gap: 1rem; align-items: end; margin-bottom: 1rem; border-color: #b9caef; background: #f7f9ff; }
    .import h2 { margin-top: .55rem; }
    .import p { margin: 0; font-size: .8rem; }
    .file-input { display: flex; min-height: 44px; align-items: center; padding: .7rem .85rem; border: 1px dashed #9fb5d7; border-radius: 11px; background: #fff; color: var(--muted); cursor: pointer; }
    .file-input input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .bank-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
    .bank { display: grid; min-height: 260px; gap: 1rem; padding: 1.2rem; }
    .bank-top, .bank-foot { display: flex; align-items: center; justify-content: space-between; gap: .7rem; }
    .origin { display: grid; width: 45px; height: 30px; place-items: center; border-radius: 9px; background: var(--surface-soft); color: var(--cobalt); font: 750 .62rem 'Cascadia Mono', Consolas, monospace; }
    .bank h2 { margin: 0; }
    .bank p { margin: .35rem 0 0; font-size: .78rem; }
    .question-count { display: flex; align-items: baseline; gap: .45rem; margin-top: auto; }
    .question-count strong { font-size: 2.4rem; letter-spacing: -.05em; }
    .question-count span, .bank-foot small { color: var(--muted); font-size: .75rem; }
    .bank-foot { padding-top: .9rem; border-top: 1px solid #edf1f6; }
    .bank-foot .btn { min-height: 36px; padding: .5rem .7rem; font-size: .72rem; }
    @media (max-width: 1050px) { .import { grid-template-columns: 1fr 1fr; } .bank-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 680px) { .import, .bank-grid { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionBanksPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly banks = signal<QuestionBank[]>([]);
  readonly loading = signal(true);
  readonly importing = signal(false);
  readonly showImport = signal(false);
  readonly error = signal('');
  importFile: File | null = null;
  bankName = '';

  ngOnInit(): void { this.load(); }
  toggleImport(): void { this.showImport.set(!this.showImport()); }
  load(): void { this.api.get<QuestionBank[]>('/question-banks').subscribe({ next: (items) => { this.banks.set(items); this.loading.set(false); }, error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); } }); }
  pickFile(event: Event): void { this.importFile = (event.target as HTMLInputElement).files?.[0] || null; if (this.importFile && !this.bankName) this.bankName = this.importFile.name.replace(/\.[^.]+$/, ''); }
  importQuestions(): void {
    if (!this.importFile || this.importing()) return;
    const form = new FormData(); form.append('file', this.importFile); form.append('name', this.bankName);
    this.importing.set(true); this.error.set('');
    this.api.post<QuestionBank>('/question-banks/import', form).pipe(finalize(() => this.importing.set(false))).subscribe({ next: (bank) => { this.banks.update((items) => [bank, ...items]); this.showImport.set(false); this.importFile = null; this.bankName = ''; }, error: (error) => this.error.set(errorMessage(error)) });
  }
}
