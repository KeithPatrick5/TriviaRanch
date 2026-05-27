import { GameAnswer, GameMode, Question } from '../types/game';

export const BLITZ_DURATION_MS = 60_000;
export const SURVIVAL_LIVES = 3;

export function scoreAnswer(correct: boolean, elapsedMs: number, streakBefore: number): number {
  if (!correct) return 0;
  const speedBonus = Math.max(0, 50 - Math.floor(elapsedMs / 250));
  const streakBonus = streakBefore >= 9 ? 100 : streakBefore >= 4 ? 50 : streakBefore >= 2 ? 25 : 0;
  return 100 + speedBonus + streakBonus;
}

export function rankFromXp(xp: number): string {
  if (xp >= 5000) return 'Neon Legend';
  if (xp >= 3000) return 'Gold III';
  if (xp >= 2000) return 'Gold II';
  if (xp >= 1200) return 'Gold I';
  if (xp >= 800) return 'Silver III';
  if (xp >= 500) return 'Silver II';
  if (xp >= 250) return 'Silver I';
  return 'Bronze I';
}

export function buildAnswer(question: Question, selectedIndex: number | null, elapsedMs: number, streakBefore: number): GameAnswer {
  const correct = selectedIndex === question.correctIndex;
  return {
    questionId: question.id,
    selectedIndex,
    correct,
    elapsedMs,
    points: scoreAnswer(correct, elapsedMs, streakBefore),
  };
}

export function resultLine(mode: GameMode, correct: number, wrong: number, maxStreak: number): string {
  if (mode === 'survival') {
    if (maxStreak >= 15) return 'MENACE RUN';
    if (wrong >= 3) return 'THREE LIVES GONE';
    return 'WARM-UP RUN';
  }
  if (correct >= 20) return 'BURIAL';
  if (correct >= 12) return 'SOLID HIT';
  return 'ROUGH RUN';
}
