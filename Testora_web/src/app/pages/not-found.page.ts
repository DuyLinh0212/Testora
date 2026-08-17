import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `<main class="not-found"><div class="mark mono">404</div><p class="eyebrow">Lạc khỏi learning rail</p><h1>Trang này không tồn tại.</h1><p>Quay lại tổng quan để tiếp tục từ bước đang học.</p><a class="btn btn-primary" routerLink="/dashboard">Về tổng quan</a></main>`,
  styles: `.not-found { display: grid; min-height: 100dvh; place-items: center; align-content: center; padding: 1rem; text-align: center; } .mark { margin-bottom: 1rem; color: #cad8ef; font-size: clamp(5rem,20vw,12rem); font-weight: 850; line-height: .8; } .not-found p { max-width: 480px; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
