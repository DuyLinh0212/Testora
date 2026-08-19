import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

let dialogSequence = 0;

/**
 * Hộp thoại xác nhận dùng chung: khóa tiêu điểm bên trong hộp thoại, đóng bằng Esc
 * hoặc nhấn ra ngoài, và trả tiêu điểm về đúng nút đã mở nó.
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="confirm-backdrop" (click)="dismiss()">
      <section
        #panel
        class="confirm-panel card"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="message() ? bodyId : null"
        (click)="$event.stopPropagation()"
      >
        @if (eyebrow()) {
          <p class="eyebrow">{{ eyebrow() }}</p>
        }
        <h2 [id]="titleId">{{ title() }}</h2>
        @if (message()) {
          <p [id]="bodyId">{{ message() }}</p>
        }
        <div class="confirm-actions">
          <button #cancel class="btn btn-secondary" type="button" (click)="dismiss()">
            {{ cancelLabel() }}
          </button>
          <button
            class="btn"
            [class.btn-primary]="tone() === 'primary'"
            [class.confirm-danger]="tone() === 'danger'"
            type="button"
            [disabled]="busy()"
            (click)="confirm()"
          >
            {{ confirmLabel() }}
          </button>
        </div>
      </section>
    </div>
  `,
  styles: `
    .confirm-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 1rem; background: rgba(22,35,58,.42); backdrop-filter: blur(5px); animation: confirm-fade 160ms ease-out; }
    .confirm-panel { width: min(430px, 100%); padding: clamp(1.2rem, 4vw, 1.6rem); box-shadow: 0 24px 70px rgba(13,27,52,.3); animation: confirm-rise 180ms ease-out; }
    .confirm-panel h2 { margin-bottom: .5rem; font-size: 1.4rem; }
    .confirm-panel p:last-of-type { margin-bottom: 0; font-size: .9rem; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: .55rem; margin-top: 1.4rem; }
    .confirm-actions .btn { min-height: 44px; padding: .66rem 1.15rem; }
    .confirm-danger { background: var(--coral); color: #fff; }
    .confirm-danger:hover:not(:disabled) { background: #d0454f; }
    @keyframes confirm-fade { from { opacity: 0; } }
    @keyframes confirm-rise { from { transform: translateY(10px) scale(.985); opacity: 0; } }
    @media (max-width: 480px) { .confirm-actions { flex-direction: column-reverse; } .confirm-actions .btn { width: 100%; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements OnDestroy {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly eyebrow = input('');
  readonly confirmLabel = input('Xác nhận');
  readonly cancelLabel = input('Hủy');
  readonly tone = input<'primary' | 'danger'>('primary');
  readonly busy = input(false);

  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancel');
  private opener: HTMLElement | null = null;

  private readonly id = ++dialogSequence;
  readonly titleId = `confirm-title-${this.id}`;
  readonly bodyId = `confirm-body-${this.id}`;

  constructor() {
    afterNextRender(() => {
      this.opener = document.activeElement as HTMLElement | null;
      this.cancelButton()?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    this.opener?.focus?.();
  }

  confirm(): void {
    if (!this.busy()) this.confirmed.emit();
  }

  dismiss(): void {
    this.dismissed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = this.focusable();
    if (!items.length) return;
    const active = document.activeElement as HTMLElement | null;
    const inside = Boolean(active && this.panel()?.nativeElement.contains(active));
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && (!inside || active === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    const root = this.panel()?.nativeElement;
    if (!root) return [];
    const selector = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (element) => element.offsetParent !== null,
    );
  }
}
