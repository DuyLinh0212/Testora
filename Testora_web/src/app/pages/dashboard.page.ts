import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/error-message';
import { DocumentItem, Quiz, Usage } from '../core/models';

interface DashboardData {
  usage: Usage;
  counts: { questionBanks: number; quizzes: number; attempts: number };
  recentDocuments: DocumentItem[];
  recentQuizzes: Quiz[];
  recentResults: Array<{
    _id: string;
    quizTitle: string;
    submittedAt: string;
    result: { score: number; correct: number; wrong: number };
  }>;
}

@Component({
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
    <section class="page">
      <header class="page-head">
        <div><p class="eyebrow">Không gian học hôm nay</p><h1>Đi từ tài liệu đến câu trả lời.</h1><p>Chọn bước tiếp theo trên learning rail của bạn.</p></div>
        <a class="btn btn-primary" routerLink="/documents">+ Thêm tài liệu</a>
      </header>

      @if (loading()) {
        <div class="grid grid-3"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      } @else if (error()) {
        <div class="message message-error" role="alert">{{ error() }}</div>
      } @else if (data(); as dashboard) {
        <article class="quota card">
          <div class="plan-block"><span class="badge">{{ dashboard.usage.plan }}</span><strong>Nhịp học trong ngày</strong><small>Giới hạn được kiểm soát từ backend.</small></div>
          <div class="quota-item"><div class="row-between"><span>AI hôm nay</span><b>{{ dashboard.usage.aiGenerations.used }} / {{ dashboard.usage.aiGenerations.limit ?? '∞' }}</b></div><div class="progress"><i [style.width.%]="percent(dashboard.usage.aiGenerations.used, dashboard.usage.aiGenerations.limit)"></i></div></div>
          <div class="quota-item"><div class="row-between"><span>Tài liệu đang lưu</span><b>{{ dashboard.usage.documents.used }} / {{ dashboard.usage.documents.limit }}</b></div><div class="progress"><i class="aqua" [style.width.%]="percent(dashboard.usage.documents.used, dashboard.usage.documents.limit)"></i></div></div>
          <a class="btn btn-secondary" routerLink="/pricing">Xem các gói</a>
        </article>

        <div class="stats-grid">
          <a class="stat card" routerLink="/question-banks"><span>Bộ câu hỏi</span><strong>{{ dashboard.counts.questionBanks }}</strong><small>Nội dung độc lập với tài liệu</small></a>
          <a class="stat card" routerLink="/quizzes"><span>Quiz đã tạo</span><strong>{{ dashboard.counts.quizzes }}</strong><small>Sẵn sàng làm và chia sẻ</small></a>
          <div class="stat card"><span>Lượt đã nộp</span><strong>{{ dashboard.counts.attempts }}</strong><small>Kết quả được lưu để xem lại</small></div>
        </div>

        <div class="dashboard-grid">
          <section class="card card-pad">
            <div class="section-head"><div><h2>Tài liệu gần đây</h2><p>Bắt đầu từ nguồn học của bạn.</p></div><a routerLink="/documents">Xem tất cả</a></div>
            @if (dashboard.recentDocuments.length) {
              <div class="list">@for (document of dashboard.recentDocuments; track document._id) { <div class="list-row"><span class="file-mark">{{ extension(document.originalFileName) }}</span><div><strong>{{ document.name }}</strong><small>{{ document.createdAt | date:'dd/MM/yyyy' }} · {{ document.processing.chunked ? 'Đã chia đoạn' : 'Đang xử lý' }}</small></div><span class="badge badge-success">{{ document.status }}</span></div> }</div>
            } @else { <div class="empty"><div class="empty-mark">↑</div><h3>Chưa có tài liệu</h3><p>Tải PDF, DOCX hoặc TXT đầu tiên để bắt đầu.</p></div> }
          </section>

          <section class="card card-pad">
            <div class="section-head"><div><h2>Kết quả mới nhất</h2><p>Xem tiến bộ qua từng lần làm.</p></div><a routerLink="/quizzes">Mở quiz</a></div>
            @if (dashboard.recentResults.length) {
              <div class="list">@for (result of dashboard.recentResults; track result._id) { <a class="result-row" [routerLink]="['/attempts', result._id, 'result']"><span class="score">{{ result.result.score | number:'1.0-1' }}</span><div><strong>{{ result.quizTitle }}</strong><small>{{ result.result.correct }} đúng · {{ result.result.wrong }} sai</small></div><span>→</span></a> }</div>
            } @else { <div class="empty"><div class="empty-mark">✓</div><h3>Chưa có kết quả</h3><p>Làm một quiz để xem điểm và lời giải tại đây.</p></div> }
          </section>
        </div>
      }
    </section>
  `,
  styles: `
    .quota { display: grid; grid-template-columns: 1.1fr 1fr 1fr auto; gap: 1.5rem; align-items: center; padding: 1.2rem 1.35rem; }
    .plan-block { display: grid; gap: .25rem; }
    .plan-block .badge { margin-bottom: .3rem; }
    .plan-block small, .quota-item span { color: var(--muted); font-size: .8rem; }
    .progress { height: 7px; margin-top: .55rem; overflow: hidden; border-radius: 99px; background: #e8edf4; }
    .progress i { display: block; height: 100%; border-radius: inherit; background: var(--cobalt); }
    .progress i.aqua { background: var(--aqua); }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0; }
    .stat { display: grid; gap: .25rem; padding: 1.15rem; color: inherit; text-decoration: none; }
    .stat > span, .stat small { color: var(--muted); font-size: .78rem; }
    .stat strong { font-size: 2rem; letter-spacing: -.04em; }
    a.stat:hover { border-color: #aebfda; }
    .dashboard-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 1rem; }
    .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .section-head p { margin: 0; font-size: .8rem; }
    .section-head a { color: var(--cobalt); font-size: .78rem; font-weight: 750; }
    .list { display: grid; }
    .list-row, .result-row { display: grid; grid-template-columns: auto 1fr auto; gap: .75rem; align-items: center; padding: .8rem 0; border-top: 1px solid #edf1f6; text-decoration: none; }
    .list-row:first-child, .result-row:first-child { border-top: 0; }
    .list-row strong, .list-row small, .result-row strong, .result-row small { display: block; }
    .list-row small, .result-row small { margin-top: .2rem; color: var(--muted); font-size: .75rem; }
    .file-mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: var(--surface-soft); color: var(--cobalt); font-size: .65rem; font-weight: 800; }
    .score { display: grid; width: 44px; height: 44px; place-items: center; border-radius: 50%; background: #e5f8f4; color: #0c7669; font-weight: 820; }
    @media (max-width: 1000px) { .quota { grid-template-columns: 1fr 1fr; } .dashboard-grid { grid-template-columns: 1fr; } }
    @media (max-width: 700px) { .quota, .stats-grid { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly data = signal<DashboardData | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    this.api.get<DashboardData>('/dashboard').subscribe({
      next: (data) => { this.data.set(data); this.loading.set(false); },
      error: (error) => { this.error.set(errorMessage(error)); this.loading.set(false); },
    });
  }

  percent(used: number, limit: number | null): number {
    return limit ? Math.min(100, (used / limit) * 100) : 8;
  }

  extension(filename: string): string {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  }
}
