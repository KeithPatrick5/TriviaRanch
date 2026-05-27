import rawQuestions from '../data/questions.json';
import { MainCategory, Question } from '../types/game';

const questions = rawQuestions as Question[];

export function getAllQuestions(): Question[] {
  return questions.filter((question) => question.status === 'active');
}

export function getQuestionsByCategory(category: MainCategory): Question[] {
  return questions.filter((question) => question.category === category && question.status === 'active');
}

export function getQuestionsByIds(ids: string[]): Question[] {
  const idSet = new Set(ids);
  const byId = new Map(questions.map((question) => [question.id, question]));
  return ids.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question) && idSet.has(question.id));
}

export function getQuestionSet(category: MainCategory, count: number, seed = Date.now(), excludeIds: string[] = []): Question[] {
  const excluded = new Set(excludeIds);
  const pool = getQuestionsByCategory(category).filter((question) => !excluded.has(question.id));
  const fallbackPool = getQuestionsByCategory(category);
  const chosenPool = pool.length >= Math.min(count, fallbackPool.length) ? pool : fallbackPool;
  const shuffled = seededShuffle(chosenPool, seed);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getDailySeed(): number {
  const today = new Date();
  const key = `${today.getUTCFullYear()}${today.getUTCMonth() + 1}${today.getUTCDate()}`;
  return Number(key);
}

export function questionCount(): number {
  return questions.length;
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let currentSeed = seed || 1;
  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
