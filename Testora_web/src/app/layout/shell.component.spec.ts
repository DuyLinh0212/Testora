import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ShellComponent } from './shell.component';

describe('ShellComponent · xác nhận đăng xuất', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let logout: jasmine.Spy;

  const dialog = () => fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement | null;
  const button = (text: string) =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((element) =>
      (element as HTMLButtonElement).textContent?.includes(text),
    ) as HTMLButtonElement;

  beforeEach(async () => {
    logout = jasmine.createSpy('logout');
    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: signal({ username: 'nguoihoc' }), loadProfile: () => of(null), logout },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShellComponent);
    await fixture.whenStable();
  });

  it('không đăng xuất ngay khi bấm nút trên thanh bên', async () => {
    button('Đăng xuất').click();
    await fixture.whenStable();

    expect(dialog()).toBeTruthy();
    expect(dialog()?.textContent).toContain('Đăng xuất khỏi Testora?');
    expect(logout).not.toHaveBeenCalled();
  });

  it('giữ phiên khi người dùng chọn Ở lại', async () => {
    button('Đăng xuất').click();
    await fixture.whenStable();

    button('Ở lại').click();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('đóng hộp thoại bằng Esc mà không đăng xuất', async () => {
    const trigger = button('Đăng xuất');
    trigger.focus();
    trigger.click();
    await fixture.whenStable();
    expect(dialog()).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });

  it('đăng xuất khi người dùng xác nhận trong hộp thoại', async () => {
    button('Đăng xuất').click();
    await fixture.whenStable();

    const confirm = Array.from(
      dialog()!.querySelectorAll<HTMLButtonElement>('button'),
    ).find((element) => element.textContent?.includes('Đăng xuất'))!;
    confirm.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
});
