# Mobile Cleanup + Clickable Wiring Audit

## Scope

This pass cleaned up the asset-driven Neon Trivia build so the approved 9:16 mockup screens stay visually aligned on Android devices while preserving real gameplay overlays.

## Phase 1: Mobile canvas / spacing cleanup

**Status: Pass**

Changes:
- Replaced full-screen `cover` scaling with a centered 9:16 mockup canvas.
- Locked the visual canvas to the source mockup ratio so overlay hitboxes do not drift on tall or short Android screens.
- Kept a dark neon shell around the canvas instead of cropping the artwork.
- Added press feedback to invisible overlays so taps have a subtle dev-visible state if enabled by platform press rendering.

Why it matters:
- The app now prioritizes correct alignment over cropping.
- Buttons and text overlays stay where the mockup expects them to be.

## Phase 2: Clickable overlay wiring audit

**Status: Pass for MVP / Partial for full product**

Clickable and wired:
- Home Start
- Home Survival
- Home Challenge
- Home Pass Phone
- Home Stats
- Home nav: Home
- Home nav: Leaderboard
- Home nav: Neon Crew
- Home nav: Shop
- Home nav: Profile
- Game Back
- Answer A
- Answer B
- Answer C
- Answer D
- Report Question
- Skip Question
- Result Run It Back
- Result Challenge Someone
- Result Home
- Result Menu

Fully functional gameplay buttons:
- Start
- Survival
- Challenge run start
- Pass Phone run start
- Answer A-D
- Report
- Skip
- Run It Back
- Home/Menu

Clickable placeholders that still need dedicated future screens:
- Leaderboard
- Neon Crew
- Shop / Neon Vault
- Profile
- Full Pass Phone player setup
- Challenge code entry / revenge queue

## Phase 3: Static audit

**Status: Pass**

The local audit checks:
- question pack integrity
- forbidden artifacts
- required mockup assets
- rebrand markers
- backend hardening files
- dynamic asset-driven screen markers
- responsive canvas markers
- clickable overlay keys
- visible button labels
- forbidden Ranch/debug copy in app code

## Final verdict

The main playable loop is wired:

Home -> Game -> Result -> Run It Back/Home

The app still needs device QA in Expo/Android to confirm runtime feel, but the code-level and visual-alignment audit now passes.
