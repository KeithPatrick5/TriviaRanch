import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

type StartPayload = {
  playerId?: string;
  mode?: string;
  category?: string;
  count?: number;
  seed?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as StartPayload;
    const playerId = String(body.playerId || '').trim();
    const mode = String(body.mode || '').trim();
    const category = String(body.category || '').trim();
    const count = clamp(Number(body.count || 20), 1, 50);
    const seed = Number.isFinite(body.seed) ? Number(body.seed) : Date.now();

    if (!playerId || !mode || !category) return jsonResponse({ error: 'missing_required_fields' }, 400);

    const supabase = getAdminClient();
    await supabase.from('users').upsert({ id: playerId, display_name: 'Neon Player', updated_at: new Date().toISOString() });

    const limited = await checkSessionRateLimit(supabase, playerId);
    if (limited) return jsonResponse({ error: 'rate_limited' }, 429);

    const questions = await selectQuestions(supabase, mode, category, count, seed);
    if (!questions.length) return jsonResponse({ error: 'no_questions_available' }, 404);

    const assignedQuestionIds = questions.map((question) => question.id);
    const { data: session, error } = await supabase
      .from('game_sessions')
      .insert({
        user_id: playerId,
        mode,
        category,
        seed,
        assigned_question_ids: assignedQuestionIds,
        validation_status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw error;
    return jsonResponse({ sessionId: session.id, questions });
  } catch (error) {
    return jsonResponse({ error: 'create_game_session_failed', detail: String(error?.message || error) }, 500);
  }
});

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Math.floor(value) : min));
}

async function checkSessionRateLimit(supabase: any, playerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from('game_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', playerId)
    .gte('created_at', since);
  return (count ?? 0) >= 8;
}

async function selectQuestions(supabase: any, mode: string, category: string, count: number, seed: number) {
  if (mode === 'daily-blitz') {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await supabase
      .from('daily_challenges')
      .select('question_ids')
      .eq('challenge_date', today)
      .eq('category', category)
      .eq('status', 'active')
      .maybeSingle();

    if (existing.data?.question_ids?.length) {
      const ids = existing.data.question_ids.slice(0, count);
      const { data } = await supabase
        .from('questions')
        .select('id,category,subcategory,difficulty,question,answers,correct_index,explanation,source_note,freshness_type,retire_after,status')
        .in('id', ids);
      return orderByIds(data ?? [], ids);
    }
  }

  const { data, error } = await supabase
    .from('questions')
    .select('id,category,subcategory,difficulty,question,answers,correct_index,explanation,source_note,freshness_type,retire_after,status')
    .eq('category', category)
    .eq('status', 'active')
    .limit(200);

  if (error) throw error;
  const selected = seededShuffle(data ?? [], seed).slice(0, count);

  if (mode === 'daily-blitz' && selected.length) {
    await supabase.from('daily_challenges').upsert(
      {
        challenge_date: new Date().toISOString().slice(0, 10),
        category,
        question_ids: selected.map((question: any) => question.id),
        seed,
        status: 'active',
      },
      { onConflict: 'challenge_date,category' },
    );
  }

  return selected;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
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

function orderByIds(rows: any[], ids: string[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
