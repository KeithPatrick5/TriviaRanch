# Android native splash actual fix

This pass changes the Android launch sequence more directly:

- Copies `assets/brand/loading-screen.png` into native Android resources as `drawable-nodpi/neon_loading_screen.png`.
- Uses a full-screen `launch_background.xml` layer-list so Android can display the selected lounge loading art before React Native renders.
- Uses a real 1x1 transparent PNG for the Android 12+ `windowSplashScreenAnimatedIcon` instead of an adaptive/launcher icon or blank vector that Android can mask into a white shape.
- Sets Android 12+ icon background to transparent.
- Forces `MainActivity` to use `Theme.App.SplashScreen`.
- Forces Gradle namespace/applicationId to `com.neontrivia.app` after prebuild.
- Keeps the React in-app loading bar behavior unchanged.

Expected local test behavior:

1. Any unavoidable Android system splash should be dark/no visible icon.
2. The lounge loading image should appear as the first branded visual.
3. The React loading screen then animates the real loading bar from 0 to 100.
4. Home appears after the bar completes.

Note: Expo development builds may still show a dev-client bundling overlay while Metro is compiling. That overlay is not part of a production release build.
