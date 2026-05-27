const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const DARK = '#020013';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, contents) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, contents);
}

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else out.push(full);
  }
  return out;
}

function transparentVectorXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#00000000" android:pathData="M0,0h108v108h-108z" />
</vector>
`;
}

function darkShapeXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/splashscreen_background" />
</shape>
`;
}

function patchColors(file) {
  let xml = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';

  const colors = {
    splashscreen_background: DARK,
    notification_icon_color: '#ffffff',
  };

  for (const [name, value] of Object.entries(colors)) {
    const re = new RegExp(`<color name="${name}">.*?<\\/color>`, 'g');
    if (re.test(xml)) xml = xml.replace(re, `<color name="${name}">${value}</color>`);
    else xml = xml.replace('</resources>', `    <color name="${name}">${value}</color>\n</resources>`);
  }

  fs.writeFileSync(file, xml);
}

function patchStyleXml(file) {
  if (!fs.existsSync(file)) return;
  let xml = fs.readFileSync(file, 'utf8');

  const items = {
    'android:windowBackground': '@drawable/splashscreen',
    windowSplashScreenBackground: '@color/splashscreen_background',
    'android:windowSplashScreenBackground': '@color/splashscreen_background',
    windowSplashScreenAnimatedIcon: '@drawable/empty_splash_icon',
    'android:windowSplashScreenAnimatedIcon': '@drawable/empty_splash_icon',
    windowSplashScreenIconBackgroundColor: '@android:color/transparent',
    'android:windowSplashScreenIconBackgroundColor': '@android:color/transparent',
  };

  for (const [name, value] of Object.entries(items)) {
    const re = new RegExp(`<item name="${name}">.*?<\\/item>`, 'g');
    xml = xml.replace(re, `<item name="${name}">${value}</item>`);
  }

  // Ensure every SplashScreen style has the transparent icon settings even if Expo did not create them.
  xml = xml.replace(/(<style[^>]+parent="[^"]*Theme\.SplashScreen[^"]*"[^>]*>)([\s\S]*?)(<\/style>)/g, (match, open, body, close) => {
    const additions = [];
    for (const [name, value] of Object.entries(items)) {
      if (!body.includes(`name="${name}"`)) additions.push(`        <item name="${name}">${value}</item>`);
    }
    if (!body.includes('postSplashScreenTheme')) additions.push('        <item name="postSplashScreenTheme">@style/AppTheme</item>');
    return `${open}${body}${additions.length ? '\n' + additions.join('\n') + '\n' : ''}${close}`;
  });

  // If Expo did not create a splash style for some reason, create one.
  if (!xml.includes('name="Theme.App.SplashScreen"')) {
    xml = xml.replace('</resources>', `    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">\n        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>\n        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>\n        <item name="windowSplashScreenAnimatedIcon">@drawable/empty_splash_icon</item>\n        <item name="android:windowSplashScreenAnimatedIcon">@drawable/empty_splash_icon</item>\n        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>\n        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/transparent</item>\n        <item name="android:windowBackground">@drawable/splashscreen</item>\n        <item name="postSplashScreenTheme">@style/AppTheme</item>\n    </style>\n</resources>`);
  }

  fs.writeFileSync(file, xml);
}

function patchManifest(file) {
  if (!fs.existsSync(file)) return;
  let xml = fs.readFileSync(file, 'utf8');

  // Android 12's system splash falls back to the launcher icon in some Expo/Gradle combinations.
  // During local testing, force a transparent launcher icon so the first native frame is a neutral dark screen,
  // then the React loading screen becomes the first branded screen.
  xml = xml.replace(/android:icon="[^"]*"/g, 'android:icon="@drawable/empty_splash_icon"');
  xml = xml.replace(/android:roundIcon="[^"]*"/g, 'android:roundIcon="@drawable/empty_splash_icon"');

  // Ensure MainActivity uses the splash theme.
  xml = xml.replace(/(<activity[^>]+android:name="\.MainActivity"[\s\S]*?)(android:theme="[^"]*")/m, '$1android:theme="@style/Theme.App.SplashScreen"');

  fs.writeFileSync(file, xml);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const root = modConfig.modRequest.platformProjectRoot;
    const resRoot = path.join(root, 'app', 'src', 'main', 'res');

    ensureDir(resRoot);

    // Dark-only native splash resources. The cinematic loading screen is handled by React immediately after launch.
    write(path.join(resRoot, 'drawable', 'empty_splash_icon.xml'), transparentVectorXml());
    write(path.join(resRoot, 'drawable', 'splashscreen_logo.xml'), transparentVectorXml());
    write(path.join(resRoot, 'drawable', 'splashscreen.xml'), darkShapeXml());

    // Also override common launcher foreground aliases that Android may use for its mandatory splash icon.
    write(path.join(resRoot, 'drawable', 'ic_launcher_foreground.xml'), transparentVectorXml());
    write(path.join(resRoot, 'drawable', 'ic_launcher_round.xml'), transparentVectorXml());

    patchColors(path.join(resRoot, 'values', 'colors.xml'));

    for (const file of listFiles(resRoot)) {
      if (/\/values[^/]*\/styles\.xml$/.test(file)) patchStyleXml(file);
      if (/\/values[^/]*\/themes\.xml$/.test(file)) patchStyleXml(file);
    }

    patchManifest(path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml'));

    return modConfig;
  }]);
};
