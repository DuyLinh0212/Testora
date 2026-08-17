import { isPlatformBrowser } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Tokens, User } from './models';

interface AuthResponse {
  user: User;
  tokens: Tokens;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly rawHttp = new HttpClient(inject(HttpBackend));
  private readonly browser = isPlatformBrowser(this.platformId);
  private refreshInFlight$: Observable<Tokens | null> | null = null;

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => Boolean(this.accessToken));

  get accessToken(): string | null {
    return this.browser ? localStorage.getItem('testora_access_token') : null;
  }

  get refreshToken(): string | null {
    return this.browser ? localStorage.getItem('testora_refresh_token') : null;
  }

  login(identifier: string, password: string) {
    return this.rawHttp
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, { identifier, password })
      .pipe(tap((response) => this.setSession(response)));
  }

  register(email: string, username: string, password: string) {
    return this.rawHttp
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, { email, username, password })
      .pipe(tap((response) => this.setSession(response)));
  }

  loadProfile() {
    if (!this.accessToken) return of(null);
    return this.rawHttp
      .get<User>(`${environment.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      })
      .pipe(
        tap((user) => this.user.set(user)),
        catchError(() => of(null)),
      );
  }

  refresh(): Observable<Tokens | null> {
    if (this.refreshInFlight$) return this.refreshInFlight$;
    const refreshToken = this.refreshToken;
    if (!refreshToken) return of<Tokens | null>(null);
    this.refreshInFlight$ = this.rawHttp
      .post<{ tokens: Tokens }>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        map((response) => response.tokens),
        tap((tokens) => this.storeTokens(tokens)),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshInFlight$;
  }

  logout(): void {
    const refreshToken = this.refreshToken;
    if (refreshToken) {
      this.rawHttp
        .post(`${environment.apiUrl}/auth/logout`, { refreshToken })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  clearSession(): void {
    if (this.browser) {
      localStorage.removeItem('testora_access_token');
      localStorage.removeItem('testora_refresh_token');
    }
    this.user.set(null);
  }

  private setSession(response: AuthResponse): void {
    this.storeTokens(response.tokens);
    this.user.set(response.user);
  }

  private storeTokens(tokens: Tokens): void {
    if (!this.browser) return;
    localStorage.setItem('testora_access_token', tokens.accessToken);
    localStorage.setItem('testora_refresh_token', tokens.refreshToken);
  }
}
