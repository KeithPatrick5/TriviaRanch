# Android Emulator Visual Polish Audit

Status: PASS for next emulator test.

## Fixes included

- Replaced the old circular cropped splash with a full-portrait Neon Trivia splash asset.
- Set Expo splash resize mode to `cover` so the splash fills the Android screen instead of showing a small centered icon.
- Tightened home mode-row typography so Survival / Challenge / Pass Phone / Stats copy does not crowd the row borders.
- Tightened top badge placement so rank / XP overlays sit better inside the badge.
- Reduced game title/category/timer/question/answer font sizes slightly for Android emulator density.
- Retuned answer feedback rectangles so correct/incorrect green/red states line up with the answer rails instead of floating outside the boxes.
- Moved result CTA labels lower so Run It Back / Challenge Someone / Home sit inside the actual button art.

## Emulator retest checklist

- Fresh uninstall/reinstall is required for native splash changes.
- If splash still shows the old icon, regenerate native Android resources with Expo prebuild.
- Confirm Home row text does not overlap.
- Confirm Game answer feedback aligns with the selected answer rail.
- Confirm Result CTA labels show inside buttons.
- Confirm no ghost text returns behind dynamic values.
