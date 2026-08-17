import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
    title: 'Đăng nhập · Testora',
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage),
    title: 'Tạo tài khoản · Testora',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage),
        title: 'Tổng quan · Testora',
      },
      {
        path: 'documents',
        loadComponent: () => import('./pages/documents.page').then((m) => m.DocumentsPage),
        title: 'Tài liệu · Testora',
      },
      {
        path: 'question-banks',
        loadComponent: () =>
          import('./pages/question-banks.page').then((m) => m.QuestionBanksPage),
        title: 'Bộ câu hỏi · Testora',
      },
      {
        path: 'question-banks/:id',
        loadComponent: () =>
          import('./pages/question-bank-detail.page').then((m) => m.QuestionBankDetailPage),
        title: 'Chi tiết bộ câu hỏi · Testora',
      },
      {
        path: 'quizzes',
        loadComponent: () => import('./pages/quizzes.page').then((m) => m.QuizzesPage),
        title: 'Quiz của tôi · Testora',
      },
      {
        path: 'quizzes/:id/play',
        loadComponent: () => import('./pages/quiz-play.page').then((m) => m.QuizPlayPage),
        title: 'Làm quiz · Testora',
      },
      {
        path: 'attempts/:id/result',
        loadComponent: () => import('./pages/result.page').then((m) => m.ResultPage),
        title: 'Kết quả · Testora',
      },
      {
        path: 'pricing',
        loadComponent: () => import('./pages/pricing.page').then((m) => m.PricingPage),
        title: 'Nâng cấp · Testora',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found.page').then((m) => m.NotFoundPage),
    title: 'Không tìm thấy · Testora',
  },
];

