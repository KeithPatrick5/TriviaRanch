export type MainCategory =
  | 'General Knowledge'
  | 'Sports'
  | 'Science'
  | 'History'
  | 'Geography'
  | 'Movies'
  | 'Music'
  | 'TV'
  | 'Gaming'
  | 'Math'
  | 'Food & Drink'
  | 'Pop Culture';

export type GameMode = 'daily-blitz' | 'survival' | 'pass-the-phone' | 'challenge';

export type FreshnessType = 'static' | 'semi-static' | 'current';

export type Question = {
  id: string;
  category: MainCategory;
  subcategory: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  question: string;
  answers: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  sourceNote: string;
  freshnessType: FreshnessType;
  retireAfter: string | null;
  status: 'active' | 'retired' | 'review';
};

export type GameAnswer = {
  questionId: string;
  selectedIndex: number | null;
  correct: boolean;
  elapsedMs: number;
  points: number;
};

export type GameResult = {
  mode: GameMode;
  category: MainCategory;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  maxStreak: number;
  totalQuestions: number;
  durationMs: number;
  answers: GameAnswer[];
  sessionId?: string | null;
  officialScore?: number;
  validationStatus?: 'local_only' | 'pending' | 'official' | 'flagged' | 'rejected';
  suspicionFlags?: string[];
  challengeCode?: string | null;
};

export type PlayerStats = {
  totalGames: number;
  totalCorrect: number;
  totalWrong: number;
  bestBlitzScore: number;
  bestSurvivalStreak: number;
  dailyStreak: number;
  xp: number;
};
