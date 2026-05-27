import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { validateAndScore, TrustedAnswer } from '../_shared/scoring.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

type SubmitPayload = {
  playerId?: string;
  sessionId?: string;
  clientScore?: number;
  durationMs?: number;
  answers?: TrustedAnswer[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as SubmitPayload;
    const playerId = String(body.playerId || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!playerId || !sessionId) return jsonResponse({ error: 'missing_required_fields' }, 400);

    const supabase = getAdminClient();
    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('id,user_id,mode,category,assigned_question_ids,validation_status,started_at')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) return jsonResponse({ error: 'session_not_found' }, 404);
    if (session.user_id !== playerId) return jsonResponse({ error: 'player_session_mismatch' }, 403);
    if (session.validation_status !== 'pending') return jsonResponse({ error: 'session_already_submitted' }, 409);

    const assignedQuestionIds = Array.isArray(session.assigned_question_ids) ? session.assigned_question_ids : [];
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id,correct_index')
      .in('id', assignedQuestionIds);

    if (questionsError) throw questionsError;

    const answers = Array.isArray(body.answers) ? body.answers : [];
    const durationMs = Math.max(0, Math.floor(Number(body.durationMs || 0)));
    const clientScore = Math.max(0, Math.floor(Number(body.clientScore || 0)));
    const validation = validateAndScore(assignedQuestionIds, questions ?? [], answers, clientScore, durationMs);

    const { error: updateError } = await supabase
      .from('game_sessions')
      .update({
        client_score: clientScore,
        official_score: validation.officialScore,
        correct_count: validation.correct,
        wrong_count: validation.wrong,
        skipped_count: validation.skipped,
        max_streak: validation.maxStreak,
        duration_ms: durationMs,
        answers,
        suspicion_flags: validation.flags,
        validation_status: validation.validationStatus,
        submitted_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) throw updateError;

    return jsonResponse({
      status: validation.validationStatus,
      officialScore: validation.officialScore,
      suspicionFlags: validation.flags,
    });
  } catch (error) {
    return jsonResponse({ error: 'submit_game_session_failed', detail: String(error?.message || error) }, 500);
  }
});
