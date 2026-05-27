# Frontend GUI Phase Audit

Palette decision: **Option 1: Black + Ranch Gold + Danger Red**.

Design target: clean dark competitive saloon scoreboard. Not cowboy cosplay, not bubbly AI, not kid trivia.

## GUI Phase 1: Theme Tokens

**Status:** Pass

Built:
- Replaced the generic charcoal palette with near-black, charcoal-brown surfaces, ranch gold, danger red, success green, and muted tan text.
- Kept legacy aliases so older components do not break.
- Added brighter gold for reward moments and dimmer gold for borders/secondary accents.

Audit:
- `src/theme/colors.ts` contains `bg`, `surface`, `surfaceRaised`, `surfaceHot`, `ranchGold`, `ranchGoldBright`, `danger`, and `success`.
- UI now has a consistent brand palette instead of generic dark mode.

## GUI Phase 2: Spacing System

**Status:** Pass

Built:
- Added `src/theme/spacing.ts` with a small reusable spacing scale.
- Tightened page gaps and card padding.
- Reduced the overly roomy starter-app feel.

Audit:
- `App.tsx` imports and uses `spacing`.
- Major screens use the shared spacing scale instead of random large gaps.

## GUI Phase 3: Home Screen Redesign

**Status:** Pass

Built:
- Added a stronger brand header with TRIVIA / RANCH lockup.
- Added rank badge in the top right.
- Made Daily Blitz the hero card because it is the daily habit anchor.
- Added tighter stats row and compact fight mode cards.

Audit:
- Home now prioritizes Daily Blitz instead of presenting four equal menu cards.
- Mode cards are denser and more competitive.

## GUI Phase 4: Category Screen Cleanup

**Status:** Pass

Built:
- Added a compact mode summary card.
- Changed category cards into tighter 2-column cards with initials, names, and small metadata.
- Preserved clean main category hierarchy.

Audit:
- Category selection is faster to scan.
- Cards no longer feel like oversized empty panels.

## GUI Phase 5: Game Screen Redesign

**Status:** Pass

Built:
- Added compact top bar with mode, category progress, and timer/lives box.
- Added score/streak/best strip.
- Added stronger question card hierarchy.
- Added answer letters in gold circles for faster scanning.
- Moved Report and Skip into a bottom action row.
- Added danger styling for low timer.

Audit:
- Main gameplay screen now feels more like a fight board and less like a form.
- Timer pressure is visually clearer.

## GUI Phase 6: Result Screen Redesign

**Status:** Pass

Built:
- Added large final score hero card.
- Added XP/rank reward line.
- Added progress bar.
- Added stronger primary and secondary action buttons.
- Kept backend status visible but compact.

Audit:
- Result screen now has more dopamine and a clearer run-it-back action.
- Backend information is still available without dominating the page.

## GUI Phase 7: Party / Challenge Surface Cleanup

**Status:** Pass

Built:
- Tightened Pass-the-Phone setup.
- Added player count badge.
- Improved player input spacing and button hierarchy.
- Challenge code area remains compact and readable.

Audit:
- Party setup is cleaner and more usable.

## Known GUI Items Still Later

- Real animations/transitions.
- Better answer reveal states after selection.
- Real challenge entry screen.
- Real leaderboard screen.
- Custom icons/brand mark.
- Device screenshots from Android emulator.
- Store-quality icon and splash assets.
