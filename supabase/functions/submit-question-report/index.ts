import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

const VALID_REASONS = new Set(['needs_review', 'wrong_answer', 'outdated', 'duplicate', 'bad_wording', 'too_easy', 'too_hard', 'offensive']);

type Payload = { playerId?: string; questionId?: string; reason?: string; note?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as Payload;
    const playerId = String(body.playerId || '').trim();
    const questionId = String(body.questionId || '').trim();
    const reason = VALID_REASONS.has(String(body.reason)) ? String(body.reason) : 'needs_review';
    const note = String(body.note || '').slice(0, 500);
    if (!playerId || !questionId) return jsonResponse({ error: 'missing_required_fields' }, 400);

    const supabase = getAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { count } = await supabase
      .from('question_reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', playerId)
      .gte('created_at', since);
    if ((count ?? 0) >= 25) return jsonResponse({ error: 'rate_limited' }, 429);

    const { error } = await supabase.from('question_reports').insert({
      user_id: playerId,
      question_id: questionId,
      reason,
      note,
    });
    if (error) throw error;

    await supabase.rpc('increment_question_report_count', { question_id_input: questionId }).catch(() => undefined);
    return jsonResponse({ status: 'reported' });
  } catch (error) {
    return jsonResponse({ error: 'submit_question_report_failed', detail: String(error?.message || error) }, 500);
  }
});
