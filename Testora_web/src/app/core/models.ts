export interface User {
  _id: string;
  email: string;
  username: string;
  currentPlan: 'FREE' | 'PRO' | 'MAX';
  settings?: { language: string };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface Usage {
  plan: 'FREE' | 'PRO' | 'MAX';
  aiGenerations: { used: number; limit: number | null };
  documents: { used: number; limit: number };
  maxFileSizeMb: number;
  advancedGeneration: boolean;
}

export interface DocumentItem {
  _id: string;
  name: string;
  originalFileName: string;
  processingMode: 'GENERATE_FROM_DOCUMENT' | 'IMPORT_EXISTING_QUESTIONS';
  status: string;
  file: { size: number; secureUrl: string; mimeType: string };
  processing: { analyzed: boolean; chunked: boolean; embedded: boolean };
  createdAt: string;
}

export interface QuestionOption {
  id: string;
  content: string;
}

export interface Question {
  _id: string;
  content: string;
  options: QuestionOption[];
  correctAnswer?: string;
  explanation?: string;
  difficulty: string;
  questionType: string;
  topic?: { name: string };
}

export interface QuestionBank {
  _id: string;
  name: string;
  questionCount: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  source: { type: string; originalDocumentName: string; documentId?: string | null };
  createdAt: string;
}

export interface Quiz {
  _id: string;
  title: string;
  description: string;
  visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  shareCode: string;
  questionBankId: string;
  config: {
    questionCount: number;
    durationMinutes: number;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    leaderboardEnabled: boolean;
  };
  stats: {
    attemptCount: number;
    participantCount: number;
    averageScore: number;
    highestScore: number;
  };
  createdAt: string;
}

