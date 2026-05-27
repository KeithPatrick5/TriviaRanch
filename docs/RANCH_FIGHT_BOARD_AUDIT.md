# Ranch Fight Board GUI Audit

Date: 2026-05-27

## Goal

Remove the remaining AI-bubbly feel from the app by changing the UI language from rounded mobile cards to a denser fight-card / scoreboard interface.

## Phase 1: Shape Language Reset

**Status: Pass**

- Reduced large rounded corners across cards, panels, buttons, badges, answer buttons, and progress bars.
- Removed pill-heavy shapes from most visible UI elements.
- Kept only small, hard radii so the app still feels modern but not soft.

## Phase 2: Gold Discipline

**Status: Pass**

- Reduced decorative gold outlines.
- Gold now functions mostly as reward, CTA, rank, and active-state color.
- Most containers use dark panel contrast instead of gold framing.

## Phase 3: Category Screen Redesign

**Status: Pass**

- Replaced two-column bubbly category cards with a one-column fight-board list.
- Category rows are flatter, denser, and easier to scan.
- Category metadata is short: `30Q`, `READY`.

## Phase 4: Game HUD Redesign

**Status: Pass**

- Added harder top HUD treatment with divider line.
- Timer/lives box is sharper and less pill-shaped.
- Question card is flatter with a left accent rail.
- Answer buttons are harder, tighter, and faster to scan.

## Phase 5: Result Screen Redesign

**Status: Pass**

- Result headline is now short and punchy.
- Result copy avoids long sentence overflow.
- Progress bar is thinner and flatter.
- CTAs are harder-edged and less bubbly.

## Phase 6: Text Containment / Copy Pass

**Status: Pass**

- Removed long sentence-style UI lines that were causing overflow risk.
- Added `numberOfLines` to high-risk result/status text.
- Kept copy punchy and game-facing.

## Remaining GUI Work

- Real emulator screenshots still needed.
- Font family should be revisited later if we want a more condensed scoreboard feel.
- Home can later get a light texture/noise layer if the clean dark look still feels too sterile.
