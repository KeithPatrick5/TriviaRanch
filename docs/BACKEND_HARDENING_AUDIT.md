# Backend Hardening Audit

This build focuses on backend flow, response trust, and basic cheat resistance. Questions are still intentionally treated as a later content phase.

## Backend Phase 1: Official Session Flow

**Status: Pass for scaffold / Needs live Supabase deploy test**

Implemented:

- `supabase/functions/create-game-session`
- App calls `startOfficialGameSession()` before gameplay when Supabase env vars exist.
- Backend creates a pending `game_sessions` row.
- Backend assigns and stores `assigned_question_ids`.
- App stores `sessionId` and submits it with the final result.
- Local fallback still works if Supabase is missing or down.

Why this matters:

The game now has a real start-of-round record instead of accepting after-the-fact score submissions as trusted truth.

## Backend Phase 2: Server-Authoritative Scoring

**Status: Pass for MVP security model / Needs deployed function test**

Implemented:

- `supabase/functions/submit-game-session`
- Shared server scoring helper in `supabase/functions/_shared/scoring.ts`
- Client score is treated as `client_score`, not trusted official score.
- Server recalculates `official_score` from submitted answers and assigned questions.
- Session is marked `official`, `flagged`, or `rejected`.

Stops:

- submitting `999999` as a trusted score
- answering questions outside the assigned set
- duplicate answer abuse
- impossible answer payloads

## Backend Phase 3: Anti-Cheat Flags

**Status: Pass for casual public competition**

Implemented suspicion flags:

- `too_many_answers`
- `duration_impossibly_short`
- `malformed_answer`
- `duplicate_answer_question`
- `answer_not_in_assigned_set`
- `assigned_question_missing`
- `answer_elapsed_too_large`
- `selected_index_out_of_range`
- `too_many_sub_120ms_answers`
- `client_score_mismatch`
- `answer_count_mismatch`

This is not casino-grade security. It is enough to stop basic payload editing and casual scoreboard spoofing.

## Backend Phase 4: Real Daily Blitz Foundation

**Status: Partial Pass**

Implemented:

- `daily_challenges` table
- `create-game-session` checks for an existing daily challenge by date/category
- If no daily challenge exists, the function creates one with locked question IDs

Remaining:

- Admin override tool
- Scheduled daily generation
- Dedicated daily leaderboard UI

## Backend Phase 5: Real Challenge Foundation

**Status: Partial Pass**

Implemented:

- `supabase/functions/create-challenge`
- `supabase/functions/submit-challenge`
- `challenges.challenge_code`
- locked question IDs
- creator official score
- opponent official score
- winner calculation

Remaining:

- App screen to enter a challenge code
- Deep links
- Revenge queue UI
- Challenge history UI

## Backend Phase 6: RLS / Trusted Tables

**Status: Partial Pass**

Improved:

- Removed public direct insert policy for trusted `game_sessions`.
- Removed public direct insert policy for `challenges`.
- Entitlements remain read/write locked from public client.
- Official score/challenge writes must go through Edge Functions using service role.

Still to do before production:

- Replace anonymous text IDs with Supabase anonymous auth or server-issued signed player tokens.
- Add stricter profile/user policies.
- Add dashboard/admin-only write routes.

## Backend Phase 7: Abuse Limits

**Status: Partial Pass**

Implemented:

- Max 8 game sessions per minute per player in `create-game-session`.
- Max 30 challenge creates per hour per player in `create-challenge`.
- Max 25 reports per day per player in `submit-question-report`.

Remaining:

- IP/device fingerprint limits
- Suspicious-session shadow exclusion from leaderboards
- Dedicated moderation queue

## Overall Security Grade

Before this pass: **D+ for public leaderboard integrity**

After this pass: **B- for casual public leaderboard integrity**, assuming Supabase Edge Functions are deployed and used.

Still not protecting real money, prizes, or anything high-stakes. It is appropriate for stopping basic cheating from casual users and bored CS kids.
