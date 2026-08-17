import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { DocumentItem, Usage } from '../core/models';

interface AiJob {
  _id?: string;
  jobId?: string;
  questionBankId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: { current: number; total: number; percent: number };
  error?: { message: string } | null;
}

@Component({
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <section class="page">
      <header class="page-head">
        <div><p class="eyebrow">Bước đầu trên learning rail</p><h1>Tài liệu</h1><p>Lưu nguồn học, chia đoạn cho RAG hoặc biến nội dung thành bộ câu hỏi.</p></div>
        @if (usage(); as current) { <div class="usage-pill"><span>{{ current.documents.used }} / {{ current.documents.limit }}</span><small>tài liệu · tối đa {{ current.maxFileSizeMb }} MB</small></div> }
      </header>

      @if (error()) { <div class="message message-error page-message" role="alert">{{ error() }}</div> }
      @if (success()) { <div class="message page-message" role="status">{{ success() }}</div> }

      <div class="document-layout">
        <aside class="upload-card card card-pad">
          <div><span class="step">01</span><h2>Thêm nguồn học</h2><p>PDF, DOCX hoặc TXT. File scan cần OCR trước.</p></div>
          <form class="stack" (ngSubmit)="upload()">
            <label class="drop-zone" for="document-file">
              <input id="document-file" type="file" accept=".pdf,.docx,.txt" (change)="pickFile($event)" />
              <span class="upload-icon">↑</span>
              @if (selectedFile) { <strong>{{ selectedFile.name }}</strong><small>{{ selectedFile.size / 1024 / 1024 | number:'1.1-1' }} MB</small> }
              @else { <strong>Chọn tài liệu</strong><small>Nhấp để duyệt file trên máy</small> }
            </label>
            <div class="field"><label for="document-name">Tên hiển thị</label><input id="document-name" name="documentName" [(ngModel)]="documentName" placeholder="Ví dụ: Cơ sở dữ liệu" /></div>
            <div class="field"><label for="processing-mode">Cách xử lý</label><select id="processing-mode" name="processingMode" [(ngModel)]="processingMode"><option value="GENERATE_FROM_DOCUMENT">Tạo câu hỏi mới từ nội dung</option><option value="IMPORT_EXISTING_QUESTIONS">Tài liệu đã có câu hỏi</option></select></div>
            <button class="btn btn-primary" type="submit" [disabled]="uploading() || !selectedFile">{{ uploading() ? 'Đang đọc tài liệu…' : 'Tải lên và phân tích' }}</button>
          </form>
        </aside>

        <div class="document-main">
          <div class="rail-caption"><span class="step">02</span><div><h2>Chọn hành động tiếp theo</h2><p>Tài liệu đã sẵn sàng có thể tạo quiz hoặc hỏi bằng RAG.</p></div></div>
          @if (loading()) {
            <div class="stack"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
          } @else if (documents().length) {
            <div class="document-list">
              @for (document of documents(); track document._id) {
                <article class="document-card card">
                  <div class="file-tile"><strong>{{ extension(document.originalFileName) }}</strong><small>{{ document.file.size / 1024 / 1024 | number:'1.1-1' }} MB</small></div>
                  <div class="document-info">
                    <div class="row"><h3>{{ document.name }}</h3><span class="badge badge-success">{{ document.status }}</span></div>
                    <p>{{ document.originalFileName }} · {{ document.createdAt | date:'dd/MM/yyyy HH:mm' }}</p>
                    <div class="processing"><span [class.on]="document.processing.analyzed">Đã đọc</span><span [class.on]="document.processing.chunked">Đã chia đoạn</span><span [class.on]="document.processing.embedded">Vector RAG</span></div>
                  </div>
                  <div class="document-actions">
                    <button class="btn btn-primary" type="button" (click)="generate(document)" [disabled]="Boolean(activeJob())">Tạo bộ câu hỏi</button>
                    <button class="btn btn-secondary" type="button" (click)="openAsk(document)">Hỏi tài liệu</button>
                    <button class="btn btn-danger" type="button" (click)="remove(document)">Xóa</button>
                  </div>
                </article>
              }
            </div>
          } @else {
            <div class="card empty"><div class="empty-mark">↑</div><h3>Learning rail đang chờ tài liệu đầu tiên</h3><p>Chọn một file ở bên trái. Bộ câu hỏi tạo ra sẽ vẫn được giữ nếu sau này bạn xóa file.</p></div>
          }

          @if (activeJob(); as job) {
            <section class="job card card-pad" aria-live="polite">
              <div class="row-between"><div><span class="badge">AI JOB</span><h3>Đang tạo bộ câu hỏi theo từng batch</h3></div><strong>{{ job.progress?.percent || 0 }}%</strong></div>
              <div class="job-progress"><i [style.width.%]="job.progress?.percent || 3"></i></div>
              <p>{{ job.progress?.current || 0 }} / {{ job.progress?.total || 0 }} câu · Bạn có thể giữ trang này mở để theo dõi.</p>
            </section>
          }
        </div>
      </div>
    </section>

    @if (askDocument(); as document) {
      <div class="dialog-backdrop" (click)="closeAsk()">
        <section class="dialog card" role="dialog" aria-modal="true" aria-labelledby="ask-title" (click)="$event.stopPropagation()">
          <div class="row-between"><div><p class="eyebrow">RAG · {{ document.name }}</p><h2 id="ask-title">Hỏi trong phạm vi tài liệu</h2></div><button class="close" type="button" (click)="closeAsk()" aria-label="Đóng">×</button></div>
          <p>Câu trả lời chỉ dùng các đoạn liên quan được truy xuất từ tài liệu này.</p>
          <form class="stack" (ngSubmit)="ask()"><div class="field"><label for="rag-question">Câu hỏi</label><textarea id="rag-question" name="ragQuestion" [(ngModel)]="ragQuestion" placeholder="Ví dụ: Chuẩn hóa 3NF giải quyết vấn đề gì?"></textarea></div><button class="btn btn-primary" type="submit" [disabled]="asking() || ragQuestion.trim().length < 3">{{ asking() ? 'Đang tìm trong tài liệu…' : 'Tìm câu trả lời' }}</button></form>
          @if (ragAnswer()) { <div class="answer"><span class="badge badge-success">Từ tài liệu</span><p>{{ ragAnswer() }}</p></div> }
        </section>
      </div>
    }
  `,
  styles: `
    .page-message { margin-bottom: 1rem; }
    .usage-pill { display: grid; min-width: 150px; padding: .7rem 1rem; border: 1px solid var(--line); border-radius: 14px; background: #fff; text-align: right; }
    .usage-pill span { font-size: 1.15rem; font-weight: 820; }
    .usage-pill small { color: var(--muted); }
    .document-layout { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 1.25rem; align-items: start; }
    .upload-card { position: sticky; top: 1rem; display: grid; gap: 1rem; }
    .step { display: grid; width: 34px; height: 26px; place-items: center; margin-bottom: .75rem; border-radius: 8px; background: var(--surface-soft); color: var(--cobalt); font: 700 .72rem 'Cascadia Mono', Consolas, monospace; }
    .upload-card p, .rail-caption p { margin: 0; font-size: .82rem; }
    .drop-zone { display: grid; min-height: 154px; place-items: center; align-content: center; gap: .35rem; padding: 1rem; border: 1.5px dashed #9eb5d8; border-radius: 16px; background: #f8fbff; text-align: center; cursor: pointer; }
    .drop-zone:hover { border-color: var(--cobalt); background: var(--surface-soft); }
    .drop-zone input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .drop-zone small { color: var(--muted); }
    .upload-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 50%; background: #dce8ff; color: var(--cobalt); font-size: 1.2rem; font-weight: 800; }
    .document-main { display: grid; gap: 1rem; }
    .rail-caption { display: flex; gap: .8rem; align-items: flex-start; }
    .rail-caption .step { flex: none; margin: 0; }
    .document-list { display: grid; gap: .8rem; }
    .document-card { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; padding: 1rem; }
    .file-tile { display: grid; width: 66px; height: 66px; place-items: center; align-content: center; border-radius: 16px; background: var(--surface-soft); color: var(--cobalt); }
    .file-tile small { color: var(--muted); font-size: .65rem; }
    .document-info h3, .document-info p { margin: 0; }
    .document-info p { margin-top: .25rem; font-size: .76rem; }
    .processing { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
    .processing span { padding: .23rem .45rem; border-radius: 999px; background: #f0f3f7; color: #8a97a9; font-size: .65rem; font-weight: 700; }
    .processing span.on { background: #e5f8f4; color: #0c7669; }
    .document-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .4rem; max-width: 250px; }
    .document-actions .btn { min-height: 36px; padding: .55rem .7rem; font-size: .72rem; }
    .job { border-color: #b9caef; background: #f5f8ff; }
    .job h3 { margin-top: .5rem; }
    .job p { margin: .55rem 0 0; font-size: .78rem; }
    .job-progress { height: 9px; margin-top: .9rem; overflow: hidden; border-radius: 99px; background: #dce5f4; }
    .job-progress i { display: block; height: 100%; border-radius: inherit; background: var(--cobalt); transition: width .35s ease; }
    .dialog-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: rgba(22,35,58,.36); backdrop-filter: blur(5px); }
    .dialog { width: min(620px, 100%); max-height: 90dvh; overflow: auto; padding: 1.4rem; box-shadow: var(--shadow); }
    .close { display: grid; width: 38px; height: 38px; place-items: center; border: 0; border-radius: 50%; background: #f0f3f7; color: var(--ink); font-size: 1.3rem; }
    .answer { margin-top: 1rem; padding: 1rem; border-left: 3px solid var(--aqua); border-radius: 0 12px 12px 0; background: #f1fbf9; white-space: pre-wrap; }
    .answer p { margin: .65rem 0 0; color: #294a46; }
    @media (max-width: 1000px) { .document-layout { grid-template-columns: 1fr; } .upload-card { position: static; } }
    @media (max-width: 700px) { .document-card { grid-template-columns: auto 1fr; } .document-actions { grid-column: 1 / -1; justify-content: stretch; max-width: none; } .document-actions .btn { flex: 1; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly documents = signal<DocumentItem[]>([]);
  readonly usage = signal<Usage | null>(null);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly activeJob = signal<AiJob | null>(null);
  readonly askDocument = signal<DocumentItem | null>(null);
  readonly asking = signal(false);
  readonly ragAnswer = signal('');
  selectedFile: File | null = null;
  documentName = '';
  processingMode: DocumentItem['processingMode'] = 'GENERATE_FROM_DOCUMENT';
  ragQuestion = '';
  protected readonly Boolean = Boolean;

  ngOnInit(): void { this.reload(); }

  reload(): void {
    this.loading.set(true);
    this.api.get<DocumentItem[]>('/documents').subscribe({ next: (items) => { this.documents.set(items); this.loading.set(false); }, error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); } });
    this.api.get<Usage>('/usage').subscribe({ next: (usage) => this.usage.set(usage) });
  }

  pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    if (this.selectedFile && !this.documentName) this.documentName = this.selectedFile.name.replace(/\.[^.]+$/, '');
  }

  upload(): void {
    if (!this.selectedFile || this.uploading()) return;
    const form = new FormData();
    form.append('file', this.selectedFile);
    form.append('name', this.documentName);
    form.append('processingMode', this.processingMode);
    this.uploading.set(true);
    this.error.set('');
    this.api.post<DocumentItem>('/documents', form).pipe(finalize(() => this.uploading.set(false))).subscribe({
      next: (document) => { this.documents.update((items) => [document, ...items]); this.selectedFile = null; this.documentName = ''; this.success.set('Tài liệu đã được đọc và sẵn sàng cho bước tiếp theo.'); this.api.get<Usage>('/usage').subscribe((usage) => this.usage.set(usage)); },
      error: (error) => this.error.set(errorMessage(error)),
    });
  }

  generate(document: DocumentItem): void {
    this.error.set('');
    this.api.post<AiJob>('/question-banks/generate', { documentId: document._id, mode: 'BASIC', questionCount: 10, difficulty: 'mixed', distribution: 'automatic', topics: [], questionTypes: ['recall', 'understanding'] }).subscribe({
      next: (job) => { this.activeJob.set({ ...job, status: 'PENDING', progress: { current: 0, total: 10, percent: 0 } }); this.pollJob(job.jobId!); },
      error: (error) => this.error.set(errorMessage(error)),
    });
  }

  private pollJob(jobId: string): void {
    setTimeout(() => this.api.get<AiJob>(`/ai-jobs/${jobId}`).subscribe({
      next: (job) => { this.activeJob.set(job); if (job.status === 'COMPLETED') { this.success.set('Bộ câu hỏi đã tạo xong. Mở mục Bộ câu hỏi để xem và tạo quiz.'); setTimeout(() => this.activeJob.set(null), 1800); } else if (job.status === 'FAILED') { this.error.set(job.error?.message || 'AI job thất bại.'); this.activeJob.set(null); } else { this.pollJob(jobId); } },
      error: (error) => { this.error.set(errorMessage(error)); this.activeJob.set(null); },
    }), 1500);
  }

  remove(document: DocumentItem): void {
    if (!window.confirm(`Xóa tài liệu “${document.name}”? Bộ câu hỏi đã tạo sẽ được giữ lại.`)) return;
    this.api.delete(`/documents/${document._id}`).subscribe({ next: () => { this.documents.update((items) => items.filter((item) => item._id !== document._id)); this.api.get<Usage>('/usage').subscribe((usage) => this.usage.set(usage)); }, error: (error) => this.error.set(errorMessage(error)) });
  }

  openAsk(document: DocumentItem): void { this.askDocument.set(document); this.ragQuestion = ''; this.ragAnswer.set(''); }
  closeAsk(): void { this.askDocument.set(null); }
  ask(): void {
    const document = this.askDocument();
    if (!document || this.ragQuestion.trim().length < 3) return;
    this.asking.set(true);
    this.api.post<{ answer: string }>(`/documents/${document._id}/ask`, { question: this.ragQuestion, maxChunks: 5 }).pipe(finalize(() => this.asking.set(false))).subscribe({ next: (response) => this.ragAnswer.set(response.answer), error: (error) => this.ragAnswer.set(errorMessage(error)) });
  }

  extension(filename: string): string { return filename.split('.').pop()?.toUpperCase() || 'FILE'; }
}
