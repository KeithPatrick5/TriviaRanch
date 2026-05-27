# Real Launch Sequence Fix

This pass fixes the Android startup and loading-bar behavior without creating new artwork.

## What changed

- Uses the selected Neon Trivia lounge image for the in-app loading screen.
- Programmatically removed the baked loading-bar artwork from the loading-screen image so the app can draw a real animated bar.
- Added a real animated loading bar that starts at 0 and fills to 100 before Home appears.
- Increased the visible loading sequence to run long enough to be seen and feel intentional.
- Fades into the Home screen after the loading bar completes.
- Reworked the Android launch splash plugin so Android's unavoidable native splash uses a neutral dark frame with a transparent splash icon, not the weak cropped app-icon circle.

## Android note

Android 12+ always shows a native system splash before React Native can render. This build makes that stage neutral and dark, then the in-app Neon Trivia loading screen becomes the first branded screen.

## Test command

After unzipping over the project folder:

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
