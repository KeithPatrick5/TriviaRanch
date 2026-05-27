# Android native splash transparent icon fix

This patch targets the final Android 12+ splash-frame issue where the app showed a white circle before the Neon Trivia loading screen.

The fix changes the custom Android prebuild plugin so the native splash uses:

- a dark splash background
- a true 1dp empty vector for `windowSplashScreenAnimatedIcon`
- a dark splash icon background color so Android cannot paint a white adaptive-icon circle
- explicit `values-v31/styles.xml` overrides for Android 12+
- a forced `Theme.App.SplashScreen` on `MainActivity`

The React loading screen and animated progress bar are unchanged.

Expected launch sequence:

1. Brief dark native frame only
2. Neon Trivia lounge loading screen
3. Real animated loading bar fills from 0 to 100
4. Home loads
