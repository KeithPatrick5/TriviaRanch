# Backend Flow

## Official Game Session

1. App calls `create-game-session` with player ID, mode, category, count, and seed.
2. Function rate-limits the player.
3. Function chooses the question set.
4. Function stores `assigned_question_ids` in `game_sessions` with `validation_status = pending`.
5. Function returns `sessionId` and questions.
6. App runs gameplay locally for speed.
7. App calls `submit-game-session` with selected answers and elapsed times.
8. Function ignores the client score as truth.
9. Function recalculates the official score from the stored question set.
10. Function stores `official_score`, counts, answers, suspicion flags, and validation status.

## Daily Blitz

Daily Blitz uses `daily_challenges` to lock question IDs by date/category. If a daily row exists, everyone gets the same set. If it does not exist, the first session creates it.

## Challenge Mode

1. Creator finishes an official challenge-mode session.
2. App calls `create-challenge`.
3. Function creates a `challenge_code` and locks the same question IDs.
4. Later opponent flow uses `submit-challenge` to compare an official opponent session against creator score.

The current app creates challenge codes after official creator submission. The opponent-code-entry screen is still a later frontend phase.
