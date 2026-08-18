import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
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

interface PaymentOrder {
  _id: string;
  planCode: 'PRO' | 'MAX';
  amountVnd: number;
  transferCode: string;
  status: 'PENDING' | 'PAID';
  expiresAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
  bank: { code: string; accountNumber: string; accountName: string };
  qrCodeUrl: string;
}

@Component({
  imports: [DatePipe],
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
            @else if (plan.code !== 'FREE') { <button class="btn btn-primary" type="button" [disabled]="creatingPayment()" (click)="startPayment(plan.code)">{{ creatingPayment() ? 'Đang tạo thanh toán…' : 'Nâng cấp ' + plan.name }}</button> }
            @else { <button class="btn btn-secondary" type="button" (click)="showMaintenance()">Chuyển về Free</button> }
          </article>
        }
      </div>
      <p class="demo-note">Chuyển khoản đúng số tiền và nội dung hiển thị. Gói sẽ tự kích hoạt ngay khi ngân hàng xác nhận.</p>
    </section>

    @if (paymentOrder(); as order) {
      <div class="payment-backdrop" (click)="closePayment()">
        <section class="payment-dialog card" role="dialog" aria-modal="true" aria-labelledby="payment-title" (click)="$event.stopPropagation()">
          <button class="payment-close" type="button" (click)="closePayment()" aria-label="Đóng thanh toán">×</button>
          <header><p class="eyebrow">Chuyển khoản VietQR</p><h2 id="payment-title">Nâng cấp {{ order.planCode }}</h2><p>Quét mã hoặc chuyển khoản thủ công. Đừng sửa nội dung chuyển khoản.</p></header>
          <div class="payment-body">
            <div class="qr-panel"><img [src]="order.qrCodeUrl" alt="Mã VietQR thanh toán Testora" /><small>Mã thanh toán riêng cho đơn này</small></div>
            <div class="transfer-details">
              <div class="amount"><span>Số tiền cần chuyển</span><strong>{{ formatVnd(order.amountVnd) }}</strong></div>
              <dl><div><dt>Ngân hàng</dt><dd>{{ order.bank.code }}</dd></div><div><dt>Số tài khoản</dt><dd class="mono">{{ order.bank.accountNumber }}</dd></div><div><dt>Chủ tài khoản</dt><dd>{{ order.bank.accountName }}</dd></div></dl>
              <div class="transfer-code"><span>Nội dung chuyển khoản</span><code>{{ order.transferCode }}</code><button type="button" (click)="copyTransferCode(order.transferCode)">Sao chép</button></div>
              @if (order.status === 'PAID') { <p class="payment-status paid">Đã nhận thanh toán. Đang kích hoạt gói của bạn…</p> }
              @else { <p class="payment-status">Đang chờ giao dịch. Đơn hết hạn lúc {{ order.expiresAt | date:'HH:mm, dd/MM' }}.</p> }
            </div>
          </div>
        </section>
      </div>
    }
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
    .payment-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 1rem; background: rgba(14, 29, 55, .56); backdrop-filter: blur(7px); }
    .payment-dialog { position: relative; width: min(720px, 100%); padding: clamp(1.2rem, 4vw, 2rem); box-shadow: 0 24px 70px rgba(13, 27, 52, .32); }
    .payment-dialog header { max-width: 520px; }
    .payment-dialog h2 { margin: .25rem 0 .45rem; font-size: clamp(1.6rem, 4vw, 2.25rem); }
    .payment-dialog header p:last-child { margin: 0; color: var(--muted); }
    .payment-close { position: absolute; top: 1rem; right: 1rem; display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 50%; background: #edf1f8; color: var(--ink); font-size: 1.3rem; cursor: pointer; }
    .payment-body { display: grid; grid-template-columns: minmax(200px, .8fr) 1.2fr; gap: 1.5rem; align-items: center; margin-top: 1.35rem; }
    .qr-panel { display: grid; gap: .65rem; padding: .8rem; border: 1px solid #d8e3f7; border-radius: 18px; background: linear-gradient(145deg, #f4f8ff, #fff); text-align: center; }
    .qr-panel img { width: 100%; max-width: 250px; margin: auto; aspect-ratio: 1; object-fit: contain; }
    .qr-panel small { color: var(--muted); font-size: .72rem; }
    .transfer-details { display: grid; gap: .85rem; }
    .amount { display: grid; gap: .15rem; padding-bottom: .85rem; border-bottom: 1px solid var(--line); }
    .amount span, dt, .transfer-code > span { color: var(--muted); font-size: .72rem; }
    .amount strong { color: var(--cobalt); font-size: 1.85rem; letter-spacing: -.045em; }
    dl { display: grid; gap: .55rem; margin: 0; }
    dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
    dd { margin: 0; color: var(--ink); font-size: .86rem; font-weight: 760; text-align: right; }
    .transfer-code { display: grid; grid-template-columns: 1fr auto; gap: .35rem .6rem; padding: .85rem; border: 1px dashed #9bb6f1; border-radius: 13px; background: #f3f6ff; }
    .transfer-code > span { grid-column: 1 / -1; }
    .transfer-code code { color: #173a9e; font: 800 .98rem 'Cascadia Mono', Consolas, monospace; letter-spacing: .045em; }
    .transfer-code button { border: 0; border-radius: 8px; background: #dce7ff; color: #173a9e; font-size: .7rem; font-weight: 750; cursor: pointer; }
    .payment-status { margin: 0; color: #64728a; font-size: .75rem; }
    .payment-status.paid { color: #08786a; font-weight: 700; }
    @media (max-width: 850px) { .plan-grid { grid-template-columns: 1fr; } .plan.featured { transform: none; } ul, .plan > p { min-height: 0; } .payment-body { grid-template-columns: 1fr; } .qr-panel { max-width: 290px; width: 100%; margin: auto; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly plans = signal<Plan[]>([]);
  readonly error = signal('');
  readonly creatingPayment = signal(false);
  readonly paymentOrder = signal<PaymentOrder | null>(null);
  private paymentPollTimer: ReturnType<typeof setTimeout> | null = null;
  ngOnInit(): void { this.api.get<Plan[]>('/plans').subscribe({ next: (plans) => this.plans.set(plans), error: (error) => this.error.set(errorMessage(error)) }); }
  ngOnDestroy(): void { if (this.paymentPollTimer) clearTimeout(this.paymentPollTimer); }
  description(code: Plan['code']): string { return code === 'FREE' ? 'Cho nhịp ôn tập nhẹ mỗi ngày.' : code === 'PRO' ? 'Cho học kỳ bận rộn và tài liệu dài.' : 'Cho thư viện tài liệu lớn và nhu cầu liên tục.'; }
  price(code: Plan['code']): string { return code === 'FREE' ? '0đ' : code === 'PRO' ? '99.000đ' : '249.000đ'; }
  showMaintenance(): void { this.error.set('Hệ thống nâng cấp đang cập nhật. Tạm thời bạn chưa thể tự thay đổi gói.'); }
  formatVnd(amount: number): string { return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`; }
  startPayment(planCode: 'PRO' | 'MAX'): void {
    if (this.creatingPayment()) return;
    this.error.set('');
    this.creatingPayment.set(true);
    this.api.post<PaymentOrder>('/payments/orders', { planCode }).pipe(finalize(() => this.creatingPayment.set(false))).subscribe({
      next: (order) => { this.paymentOrder.set(order); this.pollPayment(order._id); },
      error: (error) => this.error.set(errorMessage(error)),
    });
  }
  closePayment(): void { if (this.paymentPollTimer) clearTimeout(this.paymentPollTimer); this.paymentPollTimer = null; this.paymentOrder.set(null); }
  copyTransferCode(code: string): void { void navigator.clipboard?.writeText(code); }
  private pollPayment(orderId: string): void {
    this.paymentPollTimer = setTimeout(() => this.api.get<PaymentOrder>(`/payments/orders/${orderId}`).subscribe({
      next: (order) => {
        this.paymentOrder.set(order);
        if (order.status === 'PAID') {
          this.auth.loadProfile().subscribe();
          this.error.set('Thanh toán đã được xác nhận. Gói của bạn đã được kích hoạt.');
          this.paymentPollTimer = setTimeout(() => this.closePayment(), 2200);
        } else {
          this.pollPayment(orderId);
        }
      },
      error: (error) => { this.error.set(errorMessage(error)); this.closePayment(); },
    }), 3500);
  }
}
