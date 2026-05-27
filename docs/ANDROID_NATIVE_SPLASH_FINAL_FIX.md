# Android Native Splash Final Fix

Android 12+ can show the launcher icon before React Native starts. That is why the old cropped circle appeared before the in-app Neon Trivia loading screen.

This pass forces the native Android splash to a neutral dark frame by patching generated Android resources after prebuild:

- `windowSplashScreenAnimatedIcon` -> transparent vector
- `windowSplashScreenBackground` -> `#020013`
- `android:windowBackground` -> dark rectangle
- app manifest icon/roundIcon -> transparent vector for local debug launch
- `MainActivity` theme -> `Theme.App.SplashScreen`

The real branded loading screen remains the React Native screen using `assets/brand/loading-screen.png`, with the animated progress bar starting from 0 and filling before Home renders.

Note: the transparent launcher icon override is for local Android launch testing so the mandatory system splash does not show the old icon. Before production store packaging, restore a real launcher icon while keeping the splash icon transparent.
