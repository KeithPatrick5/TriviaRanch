# Status Bar Cleanup Audit

## Goal
Remove fake mobile status-bar content from the approved Neon Trivia mockup assets so Android can display the real OS status bar without duplicate `9:41`, signal, Wi-Fi, or battery icons.

## Changes
- Removed baked fake time/status icons from:
  - `assets/mockups/neon-home.png`
  - `assets/mockups/neon-game.png`
  - `assets/mockups/neon-result.png`
- Kept actual app UI elements:
  - menu/back button
  - Gold II badge
  - Neon Trivia wall sign
  - hero/game/result layouts
- Updated Expo status bar handling:
  - transparent status bar in `App.tsx`
  - Android status bar config in `app.json`

## Audit Result
PASS

The mockup look is preserved, but the fake concept-art phone status bar is gone. Android Studio/emulator testing should now show only the real device/system status bar.
