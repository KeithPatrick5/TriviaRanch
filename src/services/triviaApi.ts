import { GameAnswer, GameMode, GameResult, MainCategory, Question } from '../types/game';
import { getQuestionSet } from '../engine/questions';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const API_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

type RemoteQuestionRow = {
  id: string;
  category: MainCategory;
  subcategory: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  question: string;
  answers: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
  source_note: string;
  freshness_type: 'static' | 'semi-static' | 'current';
  retire_after: string | null;
  status: 'active' | 'retired' | 'review';
};

export type PlayerIdentity = {
  id: string;
  displayName: string;
};

export async function loadQuestionSet(category: MainCategory, count: number, seed: number): Promise<Question[]> {
  if (!API_ENABLED) return getQuestionSet(category, count, seed);

  try {
    const params = new URLSearchParams({
      select: 'id,category,subcategory,difficulty,question,answers,correct_index,explanation,source_note,freshness_type,retire_after,status',
      category: `eq.${category}`,
      status: 'eq.active',
      limit: String(count),
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/questions?${params.toString()}`, {
      headers: supabaseHeaders(),
    });

    if (!response.ok) throw new Error(`Question fetch failed: ${response.status}`);
    const rows = (await response.json()) as RemoteQuestionRow[];
    if (!rows.length) return getQuestionSet(category, count, seed);
    return rows.map(mapRemoteQuestion);
  } catch {
    return getQuestionSet(category, count, seed);
  }
}

export async function ensureAnonymousPlayer(localId: string): Promise<PlayerIdentity> {
  const fallback = { id: localId, displayName: 'Ranch Hand' };
  if (!API_ENABLED) return fallback;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ id: localId, display_name: fallback.displayName }),
    });

    if (!response.ok) return fallback;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : rows;
    return { id: row?.id ?? localId, displayName: row?.display_name ?? fallback.displayName };
  } catch {
    return fallback;
  }
}

export async function submitGameResult(playerId: string, result: GameResult): Promise<void> {
  if (!API_ENABLED) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/game_sessions`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        user_id: playerId,
        mode: result.mode,
        category: result.category,
        score: result.score,
        correct_count: result.correct,
        wrong_count: result.wrong,
        skipped_count: result.skipped,
        max_streak: result.maxStreak,
        duration_ms: result.durationMs,
        answers: result.answers,
      }),
    });
  } catch {
    // Local gameplay should never break because analytics/backend submission failed.
  }
}

export async function submitQuestionReport(playerId: string, questionId: string, mode: GameMode): Promise<void> {
  if (!API_ENABLED) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/question_reports`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        user_id: playerId,
        question_id: questionId,
        reason: 'needs_review',
        note: `Reported from ${mode}`,
      }),
    });
  } catch {
    // Keep the local report marker even if the network report fails.
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY ?? '',
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ''}`,
    'Content-Type': 'application/json',
  };
}

function mapRemoteQuestion(row: RemoteQuestionRow): Question {
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    difficulty: row.difficulty,
    question: row.question,
    answers: row.answers,
    correctIndex: row.correct_index,
    explanation: row.explanation,
    sourceNote: row.source_note,
    freshnessType: row.freshness_type,
    retireAfter: row.retire_after,
    status: row.status,
  };
}
