import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const authenticatedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || request.url.includes('/auth/')) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError((refreshError) => {
          auth.clearSession();
          return throwError(() => refreshError);
        }),
        switchMap((tokens) => {
          if (!tokens) {
            auth.clearSession();
            return throwError(() => error);
          }
          return next(
            request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } }),
          );
        }),
      );
    }),
  );
};
