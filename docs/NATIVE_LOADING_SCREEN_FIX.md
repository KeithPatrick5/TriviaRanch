# Native + In-App Loading Screen Fix

This pass uses the selected Neon Trivia lounge loading artwork as the shared loading asset.

Changed:
- `assets/brand/loading-screen.png`
- `assets/brand/splash.png`
- Expo splash config in `app.json`
- Android splash override in `app.json`
- `expo-splash-screen` plugin config in `app.json`
- In-app loading duration increased to roughly 3.2 seconds
- The loading bar overlay is now smaller and matched to the existing thin bar art

Important Android testing note:
If the old cropped circular splash still appears, the local generated native `android/` folder is stale. Delete/regenerate it with:

```bash
rm -rf android
npx expo prebuild --platform android --clean
npx expo run:android
```

If Gradle heap errors return after clean prebuild, re-add the local Gradle memory lines to `android/gradle.properties`.
