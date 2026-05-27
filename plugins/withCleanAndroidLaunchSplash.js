const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const DARK = '#020013';
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lVYvUQAAAABJRU5ErkJggg==';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, contents) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, contents);
}

function writeBase64(file, b64) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
  return true;
}

function unlinkIfExists(file) {
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
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

function launchBackgroundXml() {
  // This is the full-screen native launch background shown immediately after
  // Android's mandatory system splash frame and before React Native renders.
  return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="@color/splashscreen_background" />
        </shape>
    </item>
    <item>
        <bitmap
            android:src="@drawable/neon_loading_screen"
            android:gravity="fill" />
    </item>
</layer-list>
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
    splashscreen_icon_background: DARK,
    splashscreen_icon_background_color: DARK,
    iconBackground: DARK,
    notification_icon_color: '#ffffff',
  };

  for (const [name, value] of Object.entries(colors)) {
    const re = new RegExp(`<color name="${name}">.*?<\\/color>`, 'g');
    if (re.test(xml)) xml = xml.replace(re, `<color name="${name}">${value}</color>`);
    else xml = xml.replace('</resources>', `    <color name="${name}">${value}</color>\n</resources>`);
  }

  fs.writeFileSync(file, xml);
}

function setOrAddItem(body, name, value) {
  const re = new RegExp(`<item name="${name}">.*?<\\/item>`, 'g');
  if (re.test(body)) return body.replace(re, `<item name="${name}">${value}</item>`);
  return `${body}\n        <item name="${name}">${value}</item>`;
}

function patchStyleBody(body, isSplash) {
  const items = isSplash ? {
    // Android 12+ mandatory splash: no icon, no white adaptive-mask circle.
    windowSplashScreenBackground: '@color/splashscreen_background',
    'android:windowSplashScreenBackground': '@color/splashscreen_background',
    windowSplashScreenAnimatedIcon: '@drawable/transparent_splash_icon',
    'android:windowSplashScreenAnimatedIcon': '@drawable/transparent_splash_icon',
    windowSplashScreenIconBackgroundColor: '@android:color/transparent',
    'android:windowSplashScreenIconBackgroundColor': '@android:color/transparent',
    windowSplashScreenBrandingImage: '@drawable/transparent_splash_icon',
    'android:windowSplashScreenBrandingImage': '@drawable/transparent_splash_icon',
    android: '@drawable/launch_background',
  } : {};

  let patched = body;
  const baseItems = {
    'android:windowNoTitle': 'true',
    'android:windowActionBar': 'false',
    'android:windowBackground': '@drawable/launch_background',
    'android:colorAccent': '@color/splashscreen_background',
  };
  for (const [name, value] of Object.entries(baseItems)) patched = setOrAddItem(patched, name, value);
  for (const [name, value] of Object.entries(items)) {
    if (name === 'android') continue;
    patched = setOrAddItem(patched, name, value);
  }
  if (isSplash) patched = setOrAddItem(patched, 'postSplashScreenTheme', '@style/AppTheme');
  return patched;
}

function patchStyleXml(file) {
  let xml = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';

  xml = xml.replace(/(<style[^>]+name="[^"]*(?:Splash|Launch|Starting)[^"]*"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    return `${open}${patchStyleBody(body, true)}\n    ${close}`;
  });

  xml = xml.replace(/(<style[^>]+name="AppTheme"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    return `${open}${patchStyleBody(body, false)}\n    ${close}`;
  });

  if (!xml.includes('name="Theme.App.SplashScreen"')) {
    xml = xml.replace('</resources>', `    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">\n${patchStyleBody('', true)}\n    </style>\n</resources>`);
  }

  if (!xml.includes('name="Theme.App.Starting"')) {
    xml = xml.replace('</resources>', `    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n${patchStyleBody('', true)}\n    </style>\n</resources>`);
  }

  fs.writeFileSync(file, xml);
}

function forceMainActivityTheme(manifestPath) {
  if (!fs.existsSync(manifestPath)) return;
  let xml = fs.readFileSync(manifestPath, 'utf8');
  const activityRe = /<activity\b[\s\S]*?android:name="(?:\.MainActivity|com\.neontrivia\.app\.MainActivity)"[\s\S]*?>/m;
  const match = xml.match(activityRe);
  if (match) {
    let activity = match[0];
    if (/android:theme="[^"]*"/.test(activity)) {
      activity = activity.replace(/android:theme="[^"]*"/, 'android:theme="@style/Theme.App.SplashScreen"');
    } else {
      activity = activity.replace(/>$/, ' android:theme="@style/Theme.App.SplashScreen">');
    }
    xml = xml.replace(activityRe, activity);
  }
  fs.writeFileSync(manifestPath, xml);
}

function patchBuildGradle(projectRoot) {
  const gradlePath = path.join(projectRoot, 'app', 'build.gradle');
  if (!fs.existsSync(gradlePath)) return;
  let text = fs.readFileSync(gradlePath, 'utf8');
  text = text.replace(/namespace\s+["'][^"']+["']/, 'namespace "com.neontrivia.app"');
  text = text.replace(/applicationId\s+["'][^"']+["']/, 'applicationId "com.neontrivia.app"');
  fs.writeFileSync(gradlePath, text);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const root = modConfig.modRequest.platformProjectRoot;
    const appRoot = modConfig.modRequest.projectRoot;
    const resRoot = path.join(root, 'app', 'src', 'main', 'res');

    ensureDir(resRoot);

    // Copy the selected lounge loading art into native Android resources so
    // Android can show it before React Native is ready.
    const loadingAsset = path.join(appRoot, 'assets', 'brand', 'loading-screen.png');
    copyIfExists(loadingAsset, path.join(resRoot, 'drawable-nodpi', 'neon_loading_screen.png'));

    // Use a real transparent PNG, not a blank adaptive icon that Android masks white.
    for (const dir of ['drawable', 'drawable-v31', 'drawable-nodpi']) {
      unlinkIfExists(path.join(resRoot, dir, 'transparent_splash_icon.xml'));
      writeBase64(path.join(resRoot, dir, 'transparent_splash_icon.png'), TRANSPARENT_PNG_BASE64);
    }

    write(path.join(resRoot, 'drawable', 'splashscreen.xml'), darkShapeXml());
    write(path.join(resRoot, 'drawable', 'launch_background.xml'), launchBackgroundXml());
    write(path.join(resRoot, 'drawable-v31', 'splashscreen.xml'), darkShapeXml());
    write(path.join(resRoot, 'drawable-v31', 'launch_background.xml'), launchBackgroundXml());

    patchColors(path.join(resRoot, 'values', 'colors.xml'));
    patchColors(path.join(resRoot, 'values-v31', 'colors.xml'));

    for (const file of listFiles(resRoot)) {
      if (/\/values[^/]*\/(styles|themes)\.xml$/.test(file)) patchStyleXml(file);
    }

    // Force explicit Android 12+ splash override. Keep icon transparent, then
    // immediately hand off to launch_background, which is the lounge art.
    write(path.join(resRoot, 'values-v31', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionBar">false</item>
        <item name="android:windowBackground">@drawable/launch_background</item>
    </style>
    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowBackground">@drawable/launch_background</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
    <style name="Theme.App.Starting" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowBackground">@drawable/launch_background</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
</resources>
`);

    forceMainActivityTheme(path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml'));
    patchBuildGradle(root);

    return modConfig;
  }]);
};
