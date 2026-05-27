# Android QA Checklist

Run this after installing dependencies and launching on an emulator or Android device.

## Setup

```bash
npm install
npm run audit:local
npm run typecheck
npm run android
```

## Smoke Test

- App opens to the Neon Trivia home screen.
- Home screen shows question count, rank, and XP.
- No ad slots, banner placeholders, or web-first copy appears.
- Daily Blitz starts from category select.
- Survival starts from category select.
- Challenge Run starts from category select.
- Pass Phone opens player setup before category select.

## Daily Blitz

- Timer visibly counts down without needing to answer.
- Round auto-finishes when timer hits zero.
- Correct answers increase score and streak.
- Wrong answers reset streak.
- Result screen appears cleanly.

## Survival

- Starts with 3 lives.
- Wrong answers reduce lives.
- Game ends when lives hit zero.
- Best survival streak updates after a better run.

## Pass Phone

- Player names can be edited.
- Add Player works up to 8 players.
- Remove works down to 2 players.
- Turn label rotates correctly.
- Scoreboard sorts by score on result screen.

## Persistence

- Finish a run and confirm XP changes.
- Fully close the app.
- Reopen and confirm XP/rank did not reset.

## Reports

- Tap Report Question during a game.
- Button changes to Reported.
- Reopening same question on same device should not allow duplicate report.

## Backend Optional Test

Only run after setting Supabase env vars and applying `supabase/schema.sql`.

- App still starts if Supabase is unavailable.
- Question loading falls back to local questions if remote fetch fails.
- Finished game attempts score submission without blocking the result screen.
- Report Question attempts backend submission without breaking local play.
