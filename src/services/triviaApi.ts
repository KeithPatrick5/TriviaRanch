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

export type OfficialSession = {
  sessionId: string | null;
  questions: Question[];
  source: 'edge_function' | 'rest_fallback' | 'local_fallback';
};

export type OfficialSubmission = {
  status: 'official' | 'flagged' | 'rejected' | 'local_only';
  officialScore?: number;
  suspicionFlags: string[];
  challengeCode?: string | null;
};

export type ChallengeCreateResponse = {
  challengeId: string;
  challengeCode: string;
  expiresAt: string;
};

export async function startOfficialGameSession(
  playerId: string,
  mode: GameMode,
  category: MainCategory,
  count: number,
  seed: number,
): Promise<OfficialSession> {
  if (API_ENABLED) {
    const edgeSession = await invokeEdge<{ sessionId: string; questions: RemoteQuestionRow[] }>('create-game-session', {
      playerId,
      mode,
      category,
      count,
      seed,
    });

    if (edgeSession?.sessionId && edgeSession.questions?.length) {
      return {
        sessionId: edgeSession.sessionId,
        questions: edgeSession.questions.map(mapRemoteQuestion),
        source: 'edge_function',
      };
    }
  }

  const fallbackQuestions = await loadQuestionSet(category, count, seed);
  return { sessionId: null, questions: fallbackQuestions, source: API_ENABLED ? 'rest_fallback' : 'local_fallback' };
}

export async function loadQuestionSet(category: MainCategory, count: number, seed: number): Promise<Question[]> {
  if (!API_ENABLED) return getQuestionSet(category, count, seed);

  try {
    const params = new URLSearchParams({
      select: 'id,category,subcategory,difficulty,question,answers,correct_index,explanation,source_note,freshness_type,retire_after,status',
      category: `eq.${category}`,
      status: 'eq.active',
      order: 'id.asc',
      limit: String(count),
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/questions?${params.toString()}`, {
      headers: supabaseHeaders(),
    });

    if (!response.ok) throw new Error(`Question fetch failed: ${response.status}`);
    const rows = (await response.json()) as RemoteQuestionRow[];
    if (!rows.length) return getQuestionSet(category, count, seed);
    return seededRows(rows, seed).slice(0, count).map(mapRemoteQuestion);
  } catch {
    return getQuestionSet(category, count, seed);
  }
}

export async function ensureAnonymousPlayer(localId: string): Promise<PlayerIdentity> {
  const fallback = { id: localId, displayName: 'Neon Player' };
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

export async function submitGameResult(playerId: string, result: GameResult): Promise<OfficialSubmission> {
  if (!API_ENABLED || !result.sessionId) {
    return { status: 'local_only', suspicionFlags: [] };
  }

  const submitted = await invokeEdge<OfficialSubmission>('submit-game-session', {
    playerId,
    sessionId: result.sessionId,
    clientScore: result.score,
    durationMs: result.durationMs,
    answers: result.answers.map(stripClientAnswerTrust),
  });

  if (!submitted) return { status: 'local_only', suspicionFlags: ['submit_failed_local_result_kept'] };
  return submitted;
}

export async function submitQuestionReport(
  playerId: string,
  questionId: string,
  mode: GameMode,
  reason = 'needs_review',
): Promise<void> {
  if (!API_ENABLED) return;

  try {
    await invokeEdge('submit-question-report', {
      playerId,
      questionId,
      reason,
      note: `Reported from ${mode}`,
    });
  } catch {
    // Keep the local report marker even if the network report fails.
  }
}

export async function createChallengeFromSession(playerId: string, sessionId: string): Promise<ChallengeCreateResponse | null> {
  if (!API_ENABLED) return null;
  return invokeEdge<ChallengeCreateResponse>('create-challenge', { playerId, sessionId });
}

async function invokeEdge<T>(functionName: string, payload: unknown): Promise<T | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY ?? '',
    Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ''}`,
    'Content-Type': 'application/json',
  };
}

function stripClientAnswerTrust(answer: GameAnswer) {
  return {
    questionId: answer.questionId,
    selectedIndex: answer.selectedIndex,
    elapsedMs: answer.elapsedMs,
    clientPoints: answer.points,
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

function seededRows<T extends { id: string }>(items: T[], seed: number): T[] {
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
