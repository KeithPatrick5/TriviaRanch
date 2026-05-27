# Pre-Question Stability Audit

Status: Pass for static/code audit. Android device testing is still required.

## Fixes made

- Fixed the `App.tsx` syntax error in `modeCopy`.
- Added a finish lock so timer expiry and answer taps cannot double-submit the same round.
- Fixed Daily Blitz streak so it only increments once per calendar day.
- Added a basic challenge-code entry screen so the flow has a visible place to chase codes.
- Added short report confirmation feedback.
- Tightened leaderboard visibility to official sessions only. Flagged runs remain stored for review but should not appear in public leaderboards by default.
- Tightened challenge creation/comparison so flagged sessions cannot create/chase public challenge wins by default.

## Audit notes

- Gameplay still runs locally for speed.
- Server-authoritative scoring remains the backend path when Supabase is configured.
- Questions still include `correctIndex` on the client. This is acceptable for MVP, but ranked modes should later use server-side grading without exposing answers before submission.
- Real Android emulator/device testing is still needed before question work.
