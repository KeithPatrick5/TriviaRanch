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
  if (xp >= 5000) return 'Black Hat Ranch';
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
    if (maxStreak >= 15) return 'Absolute menace. That run had teeth.';
    if (wrong >= 3) return 'Three lives gone. You know exactly which one was stupid.';
    return 'Warm-up run. Run it back.';
  }
  if (correct >= 20) return 'That was a beating. Send it to someone.';
  if (correct >= 12) return 'Solid run. Not genius, not embarrassing.';
  return 'That was rough. Fortunately, deleting the app is coward behavior.';
}
