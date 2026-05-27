# Android startup splash strategy

Android 12+ always shows a native splash frame before React Native can render. Fighting that with transparent or blank adaptive icons caused cropped circles and white masks during emulator testing.

The current strategy is the standard production approach:

1. Native Android splash uses a dark background and a simple padded Neon Trivia question-mark mark.
2. The full cinematic Neon Trivia lounge loading screen appears immediately after React mounts.
3. The in-app loading bar starts at zero, fills to completion, then transitions to Home.

This avoids the ugly launcher-icon splash while respecting Android's required native launch frame.

Do not use transparent icon hacks for the native splash. If the launch frame needs to change later, update `assets/brand/native-splash-icon.png` and keep it simple, centered, and padded.
