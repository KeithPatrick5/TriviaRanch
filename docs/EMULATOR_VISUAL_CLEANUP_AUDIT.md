# Emulator Visual Cleanup Audit

Status: PASS for next emulator test.

Fixes applied after first Android emulator run:

- Cleaned mockup assets so baked demo text no longer fights dynamic text.
- Home: blanked rank, XP, hero category, timer, and stat number zones.
- Game: blanked mode title, category, timer, score/streak/best values, question text, and answer text zones.
- Result: blanked headline, score, XP/correct values, rank/progress zones, and top badge text.
- Reduced live question and answer typography so long questions/answers fit better on Android.
- Added `adjustsFontSizeToFit` and `ellipsizeMode="tail"` on dynamic answer text.
- Changed mockup canvas to fill the actual Android screen instead of center-letterboxing the 9:16 art.
- Added Expo Metro config extending `expo/metro-config` for Expo SDK compatibility.

Remaining item for emulator QA:

- Verify exact visual fit on Pixel 6 emulator after reinstall.
- If answer text still truncates too aggressively, next pass should shorten question copy or allow two-line answers on select categories.
