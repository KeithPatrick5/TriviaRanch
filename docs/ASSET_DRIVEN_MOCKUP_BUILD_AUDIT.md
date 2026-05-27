# Asset-Driven Mockup Build Audit

## Goal
Rebuild the Neon Trivia UI so the actual app uses the approved neon mockup screens as production visual assets, then layer real tappable gameplay controls on top.

## Phase 1: Mockup assets
Status: Pass

Added:
- `assets/mockups/neon-home.png`
- `assets/mockups/neon-game.png`
- `assets/mockups/neon-result.png`

These are no longer just reference screenshots. They are loaded by the React Native app as full-screen `ImageBackground` screen assets.

## Phase 2: Home screen clickable overlay
Status: Pass

The home screen uses the approved Neon Trivia lounge mockup as the visual base. Invisible tappable zones are mapped over:
- Start
- Survival
- Challenge
- Pass Phone
- Stats
- Bottom nav items

## Phase 3: Game screen clickable overlay
Status: Pass

The gameplay screen uses the approved neon game-show question screen as the visual base. Invisible tappable zones are mapped over:
- Back
- Answer A
- Answer B
- Answer C
- Answer D
- Report
- Skip

Gameplay logic remains live behind the visual asset.

## Phase 4: Result screen clickable overlay
Status: Pass

The results screen uses the approved victory mockup as the visual base. Invisible tappable zones are mapped over:
- Run It Back
- Challenge Someone
- Home
- Menu/Home

## Phase 5: Backend/gameplay preservation
Status: Pass

The prior gameplay and backend hardening were preserved:
- `startOfficialGameSession`
- `submitGameResult`
- `submitQuestionReport`
- `createChallengeFromSession`
- finish lock protection
- daily streak protection
- local/offline fallback

## Phase 6: Brand cleanup
Status: Pass

The visible mockups use Neon Trivia direction. The old Ranch Crew label has been replaced in the visual home asset with Neon Crew.

## Honest notes
This build prioritizes matching the approved mockups over flexible component rendering. It is the correct prototype path for visual accuracy.

Tradeoffs:
- The main screen visuals are image assets.
- Some baked text is not dynamic yet.
- Future production passes should slice the mockups into reusable assets so timers, questions, ranks, and categories can all be dynamic without losing the premium look.

## Audit result
Pass.
