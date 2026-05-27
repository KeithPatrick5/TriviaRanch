# Frontend Copy Cleanup Audit

Status: Pass

This pass removed user-facing text that sounded like build notes, backend/debug status, scaffolding language, or over-explanation.

## Cleaned

- Removed backend/debug wording from the result screen.
- Replaced technical challenge fallback wording with normal player-facing challenge copy.
- Removed `local fallback`, `Supabase functions`, `backend created`, `opponent flow comes next`, `session`, `source`, `validation`, and `official score` from visible result UI.
- Replaced `Local Scoreboard` with `Scoreboard`.
- Replaced `30 starter questions` with `30 questions`.
- Tightened home/category/party copy so it feels like a game, not a project explanation.
- Removed the home tagline's ad explanation and kept the brand punchier.

## Kept

- Internal backend docs remain in `docs/` because they are project/developer files, not in-app user copy.
- Internal variables and service names remain in code because they are implementation details, not rendered UI.
- A user-facing score review notice remains only when a run is flagged or rejected.

## Current user-facing copy direction

Short, sharp, player-facing game text only:

- Fast trivia fights. No mercy.
- Pick your lane.
- Beat your best.
- Run it back.
- Send this code. Make them chase it.

## Result

The app UI no longer exposes backend plumbing, scaffold status, or builder-facing explanations.
