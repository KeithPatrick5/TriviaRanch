const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeIfChanged(file, contents) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) {
    fs.writeFileSync(file, contents);
  }
}

function patchStyles(file) {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/<item name="windowSplashScreenAnimatedIcon">.*?<\/item>/g, '<item name="windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>');
  text = text.replace(/<item name="windowSplashScreenBackground">.*?<\/item>/g, '<item name="windowSplashScreenBackground">@color/splashscreen_background</item>');
  text = text.replace(/<item name="android:windowSplashScreenAnimatedIcon">.*?<\/item>/g, '<item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>');
  text = text.replace(/<item name="android:windowSplashScreenBackground">.*?<\/item>/g, '<item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>');
  fs.writeFileSync(file, text);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const root = modConfig.modRequest.platformProjectRoot;
    const mainRes = path.join(root, 'app', 'src', 'main', 'res');
    const valuesDir = path.join(mainRes, 'values');
    const drawableDir = path.join(mainRes, 'drawable');
    const values31Dir = path.join(mainRes, 'values-v31');
    ensureDir(valuesDir);
    ensureDir(drawableDir);
    ensureDir(values31Dir);

    const colorsPath = path.join(valuesDir, 'colors.xml');
    let colors = fs.existsSync(colorsPath)
      ? fs.readFileSync(colorsPath, 'utf8')
      : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
    if (!colors.includes('name="splashscreen_background"')) {
      colors = colors.replace('</resources>', '    <color name="splashscreen_background">#020013</color>\n</resources>');
    }
    writeIfChanged(colorsPath, colors);

    writeIfChanged(path.join(drawableDir, 'transparent_splash_icon.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="1dp"
    android:height="1dp"
    android:viewportWidth="1"
    android:viewportHeight="1">
    <path android:fillColor="#00000000" android:pathData="M0,0h1v1h-1z" />
</vector>
`);

    patchStyles(path.join(valuesDir, 'styles.xml'));
    patchStyles(path.join(values31Dir, 'styles.xml'));
    return modConfig;
  }]);
};
