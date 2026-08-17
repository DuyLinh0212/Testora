import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { errorMessage } from '../core/error-message';

interface Plan {
  _id: string;
  code: 'FREE' | 'PRO' | 'MAX';
  name: string;
  limits: {
    aiGenerationsPerDay: number | null;
    maxStoredDocuments: number;
    maxFileSizeMb: number;
    advancedGeneration: boolean;
  };
}

@Component({
  template: `
    <section class="page pricing-page">
      <header class="pricing-head"><p class="eyebrow">Chọn nhịp học phù hợp</p><h1>Giới hạn rõ ràng, nâng cấp khi thực sự cần.</h1><p>Question Bank, quiz và kết quả không biến mất khi bạn xóa tài liệu nguồn.</p></header>
      @if (error()) { <div class="message message-error">{{ error() }}</div> }
      <div class="plan-grid">
        @for (plan of plans(); track plan.code) {
          <article class="plan card" [class.featured]="plan.code === 'PRO'" [class.current]="auth.user()?.currentPlan === plan.code">
            <div class="plan-top"><div><span class="badge" [class.badge-success]="auth.user()?.currentPlan === plan.code">{{ auth.user()?.currentPlan === plan.code ? 'GÓI HIỆN TẠI' : plan.code }}</span><h2>{{ plan.name }}</h2></div>@if (plan.code === 'PRO') { <span class="recommend">Cân bằng nhất</span> }</div>
            <p>{{ description(plan.code) }}</p>
            <div class="price"><strong>{{ price(plan.code) }}</strong><span>{{ plan.code === 'FREE' ? '' : '/ tháng' }}</span></div>
            <ul><li><b>{{ plan.limits.aiGenerationsPerDay ?? 'Không giới hạn' }}</b> lượt tạo AI / ngày</li><li>File tối đa <b>{{ plan.limits.maxFileSizeMb }} MB</b></li><li>Lưu đồng thời <b>{{ plan.limits.maxStoredDocuments }}</b> tài liệu</li><li [class.off]="!plan.limits.advancedGeneration">{{ plan.limits.advancedGeneration ? 'Có' : 'Không có' }} cấu hình AI nâng cao</li><li>Giữ bộ câu hỏi sau khi xóa tài liệu</li></ul>
            @if (auth.user()?.currentPlan === plan.code) { <button class="btn btn-secondary" type="button" disabled>Đang sử dụng</button> }
            @else if (plan.code !== 'FREE') { <button class="btn btn-primary" type="button" (click)="showMaintenance()">Nâng cấp {{ plan.name }}</button> }
            @else { <button class="btn btn-secondary" type="button" (click)="showMaintenance()">Chuyển về Free</button> }
          </article>
        }
      </div>
      <p class="demo-note">Hệ thống nâng cấp đang cập nhật. Tạm thời bạn chưa thể tự thay đổi gói.</p>
    </section>
  `,
  styles: `
    .pricing-head { max-width: 760px; margin: 0 auto 2rem; text-align: center; }
    .pricing-head h1 { font-size: clamp(2.3rem,5vw,4.5rem); }
    .plan-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; align-items: stretch; }
    .plan { position: relative; display: grid; gap: 1rem; padding: 1.3rem; }
    .plan.featured { border: 2px solid var(--cobalt); box-shadow: var(--shadow); transform: translateY(-8px); }
    .plan.current { background: #f4fbfa; }
    .plan-top { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
    .plan h2 { margin-top: .65rem; font-size: 1.55rem; }
    .recommend { padding: .3rem .5rem; border-radius: 8px; background: var(--sun); color: #5a4308; font-size: .65rem; font-weight: 800; }
    .plan > p { min-height: 3.5rem; margin: 0; font-size: .82rem; }
    .price { display: flex; align-items: baseline; gap: .4rem; padding: .5rem 0; }
    .price strong { font-size: 2.2rem; letter-spacing: -.05em; }
    .price span { color: var(--muted); font-size: .75rem; }
    ul { display: grid; gap: .65rem; min-height: 190px; margin: 0; padding: 0; list-style: none; color: #53627a; font-size: .82rem; }
    li::before { margin-right: .45rem; color: var(--aqua); content: '✓'; font-weight: 800; }
    li.off { color: #9aa6b5; }
    li.off::before { color: #b4bdc9; content: '–'; }
    .plan .btn { width: 100%; align-self: end; }
    .demo-note { max-width: 700px; margin: 1.6rem auto 0; padding: .75rem 1rem; border-radius: 12px; background: #fff7dd; color: #6a5210; font-size: .75rem; text-align: center; }
    @media (max-width: 850px) { .plan-grid { grid-template-columns: 1fr; } .plan.featured { transform: none; } ul, .plan > p { min-height: 0; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly plans = signal<Plan[]>([]);
  readonly error = signal('');
  ngOnInit(): void { this.api.get<Plan[]>('/plans').subscribe({ next: (plans) => this.plans.set(plans), error: (error) => this.error.set(errorMessage(error)) }); }
  description(code: Plan['code']): string { return code === 'FREE' ? 'Cho nhịp ôn tập nhẹ mỗi ngày.' : code === 'PRO' ? 'Cho học kỳ bận rộn và tài liệu dài.' : 'Cho thư viện tài liệu lớn và nhu cầu liên tục.'; }
  price(code: Plan['code']): string { return code === 'FREE' ? '0đ' : code === 'PRO' ? '99.000đ' : '249.000đ'; }
  showMaintenance(): void { this.error.set('Hệ thống nâng cấp đang cập nhật. Tạm thời bạn chưa thể tự thay đổi gói.'); }
}
