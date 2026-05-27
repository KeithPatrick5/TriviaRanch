import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';

type Payload = { playerId?: string; sessionId?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = (await req.json()) as Payload;
    const playerId = String(body.playerId || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!playerId || !sessionId) return jsonResponse({ error: 'missing_required_fields' }, 400);

    const supabase = getAdminClient();
    const limited = await checkChallengeRateLimit(supabase, playerId);
    if (limited) return jsonResponse({ error: 'rate_limited' }, 429);

    const { data: session, error } = await supabase
      .from('game_sessions')
      .select('id,user_id,category,seed,assigned_question_ids,official_score,validation_status')
      .eq('id', sessionId)
      .single();

    if (error || !session) return jsonResponse({ error: 'session_not_found' }, 404);
    if (session.user_id !== playerId) return jsonResponse({ error: 'player_session_mismatch' }, 403);
    if (session.validation_status !== 'official') return jsonResponse({ error: 'session_not_official' }, 409);

    const challengeCode = makeChallengeCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: challenge, error: insertError } = await supabase
      .from('challenges')
      .insert({
        challenge_code: challengeCode,
        creator_user_id: playerId,
        category: session.category,
        seed: session.seed,
        question_ids: session.assigned_question_ids,
        creator_session_id: session.id,
        creator_official_score: session.official_score,
        expires_at: expiresAt,
        status: 'open',
      })
      .select('id,challenge_code,expires_at')
      .single();

    if (insertError) throw insertError;
    return jsonResponse({ challengeId: challenge.id, challengeCode: challenge.challenge_code, expiresAt: challenge.expires_at });
  } catch (error) {
    return jsonResponse({ error: 'create_challenge_failed', detail: String(error?.message || error) }, 500);
  }
});

async function checkChallengeRateLimit(supabase: any, playerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase
    .from('challenges')
    .select('id', { count: 'exact', head: true })
    .eq('creator_user_id', playerId)
    .gte('created_at', since);
  return (count ?? 0) >= 30;
}

function makeChallengeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'TR-';
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
