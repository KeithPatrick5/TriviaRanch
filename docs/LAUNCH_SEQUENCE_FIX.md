# Launch Sequence Fix

This build fixes the app startup sequence so the weak Android icon-style launch screen no longer appears as the visible first impression.

## What changed

- Added `expo-splash-screen` as the Expo SDK 51-compatible package.
- Added `plugins/withCleanAndroidLaunchSplash.js`.
- The custom Android prebuild plugin replaces the Android 12+ splash icon with a transparent 1dp drawable and uses the Neon Trivia dark background color.
- The cinematic Neon Trivia lounge loading screen is now the first meaningful visual screen once React Native starts.
- The in-app loading animation starts only after the loading screen mounts.
- The loading bar starts at zero, fills across the full bar, then transitions to Home after completion.

## Why this exists

Android 12+ forces a native system splash screen before React Native can render. A rich full-screen cinematic screen cannot be fully controlled by React until the JS app starts. The native splash is now made visually neutral so the user does not see the weak cropped icon screen, then the real Neon Trivia loader appears and animates properly.

## Local testing after clean prebuild

```bash
cd /Users/admin/Desktop/neon-trivia

rm -rf android

export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"

npm install --no-package-lock
npx expo prebuild --platform android --clean

cat >> android/gradle.properties <<'GRADLE'

# Local Android build stability
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8
org.gradle.workers.max=2
kotlin.daemon.jvmargs=-Xmx2048m
GRADLE

adb uninstall com.neontrivia.app || true
npx expo run:android
```
