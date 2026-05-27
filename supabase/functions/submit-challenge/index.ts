import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

type Payload = { playerId?: string; challengeCode?: string; sessionId?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as Payload;
    const playerId = String(body.playerId || '').trim();
    const challengeCode = String(body.challengeCode || '').trim().toUpperCase();
    const sessionId = String(body.sessionId || '').trim();
    if (!playerId || !challengeCode || !sessionId) return jsonResponse({ error: 'missing_required_fields' }, 400);

    const supabase = getAdminClient();
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select('*')
      .eq('challenge_code', challengeCode)
      .single();

    if (challengeError || !challenge) return jsonResponse({ error: 'challenge_not_found' }, 404);
    if (challenge.status !== 'open') return jsonResponse({ error: 'challenge_not_open' }, 409);
    if (new Date(challenge.expires_at).getTime() < Date.now()) return jsonResponse({ error: 'challenge_expired' }, 410);

    const { data: session, error: sessionError } = await supabase
      .from('game_sessions')
      .select('id,user_id,assigned_question_ids,official_score,validation_status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) return jsonResponse({ error: 'session_not_found' }, 404);
    if (session.user_id !== playerId) return jsonResponse({ error: 'player_session_mismatch' }, 403);
    if (session.validation_status !== 'official') return jsonResponse({ error: 'session_not_official' }, 409);

    const expected = JSON.stringify(challenge.question_ids ?? []);
    const actual = JSON.stringify(session.assigned_question_ids ?? []);
    if (expected !== actual) return jsonResponse({ error: 'question_set_mismatch' }, 409);

    const creatorScore = challenge.creator_official_score ?? 0;
    const opponentScore = session.official_score ?? 0;
    const winner = opponentScore > creatorScore ? playerId : challenge.creator_user_id;

    const { error: updateError } = await supabase
      .from('challenges')
      .update({
        opponent_user_id: playerId,
        opponent_session_id: session.id,
        opponent_official_score: opponentScore,
        winner_user_id: winner,
        status: 'completed',
      })
      .eq('id', challenge.id);

    if (updateError) throw updateError;
    return jsonResponse({ status: 'completed', winnerUserId: winner, creatorScore, opponentScore });
  } catch (error) {
    return jsonResponse({ error: 'submit_challenge_failed', detail: String(error?.message || error) }, 500);
  }
});
