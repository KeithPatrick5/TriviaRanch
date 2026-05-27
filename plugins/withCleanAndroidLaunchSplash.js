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

function copy(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function read(file, fallback = '') {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : fallback;
}

function patchColors(file) {
  let xml = read(file, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n');
  const colors = {
    splashscreen_background: DARK,
    splashscreen_icon_background: DARK,
    splashscreen_icon_background_color: DARK,
    iconBackground: DARK,
    notification_icon_color: '#ffffff',
  };

  for (const [name, value] of Object.entries(colors)) {
    const re = new RegExp(`<color name="${name}">.*?<\\/color>`, 'g');
    if (re.test(xml)) {
      xml = xml.replace(re, `<color name="${name}">${value}</color>`);
    } else {
      xml = xml.replace('</resources>', `    <color name="${name}">${value}</color>\n</resources>`);
    }
  }

  write(file, xml);
}

function setItem(body, name, value) {
  const re = new RegExp(`<item name="${name}">.*?<\\/item>`, 'g');
  if (re.test(body)) return body.replace(re, `<item name="${name}">${value}</item>`);
  return `${body}\n        <item name="${name}">${value}</item>`;
}

function splashStyleBody(body = '') {
  let out = body;
  const items = {
    windowSplashScreenBackground: '@color/splashscreen_background',
    'android:windowSplashScreenBackground': '@color/splashscreen_background',
    windowSplashScreenAnimatedIcon: '@drawable/native_splash_icon',
    'android:windowSplashScreenAnimatedIcon': '@drawable/native_splash_icon',
    windowSplashScreenIconBackgroundColor: '@android:color/transparent',
    'android:windowSplashScreenIconBackgroundColor': '@android:color/transparent',
    postSplashScreenTheme: '@style/AppTheme',
    'android:windowNoTitle': 'true',
    'android:windowActionBar': 'false',
  };
  for (const [name, value] of Object.entries(items)) out = setItem(out, name, value);
  return out;
}

function appStyleBody(body = '') {
  let out = body;
  const items = {
    'android:windowNoTitle': 'true',
    'android:windowActionBar': 'false',
    'android:windowBackground': '@color/splashscreen_background',
    'android:colorAccent': '@color/splashscreen_background',
  };
  for (const [name, value] of Object.entries(items)) out = setItem(out, name, value);
  return out;
}

function patchStyles(file) {
  let xml = read(file, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n');

  xml = xml.replace(/(<style[^>]+name="[^"]*(?:Splash|Launch|Starting)[^"]*"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    return `${open}${splashStyleBody(body)}\n    ${close}`;
  });

  xml = xml.replace(/(<style[^>]+name="AppTheme"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    return `${open}${appStyleBody(body)}\n    ${close}`;
  });

  if (!xml.includes('name="Theme.App.SplashScreen"')) {
    xml = xml.replace('</resources>', `    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">\n${splashStyleBody('')}\n    </style>\n</resources>`);
  }

  if (!xml.includes('name="Theme.App.Starting"')) {
    xml = xml.replace('</resources>', `    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n${splashStyleBody('')}\n    </style>\n</resources>`);
  }

  write(file, xml);
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

function patchManifest(file) {
  if (!fs.existsSync(file)) return;
  let xml = read(file);
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
    write(file, xml);
  }
}

function patchBuildGradle(root) {
  const file = path.join(root, 'app', 'build.gradle');
  if (!fs.existsSync(file)) return;
  let text = read(file);
  text = text.replace(/namespace\s+["'][^"']+["']/, 'namespace "com.neontrivia.app"');
  text = text.replace(/applicationId\s+["'][^"']+["']/, 'applicationId "com.neontrivia.app"');
  write(file, text);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const androidRoot = modConfig.modRequest.platformProjectRoot;
    const projectRoot = modConfig.modRequest.projectRoot;
    const resRoot = path.join(androidRoot, 'app', 'src', 'main', 'res');

    // Give Android 12+ a real padded Neon Trivia mark for the mandatory native splash.
    // Do not use transparent/adaptive hacks: those cause the white/cropped circles.
    const icon = path.join(projectRoot, 'assets', 'brand', 'native-splash-icon.png');
    if (fs.existsSync(icon)) {
      copy(icon, path.join(resRoot, 'drawable-nodpi', 'native_splash_icon.png'));
    }

    // Keep the full cinematic lounge screen for the React loading screen only.
    const loading = path.join(projectRoot, 'assets', 'brand', 'loading-screen.png');
    if (fs.existsSync(loading)) {
      copy(loading, path.join(resRoot, 'drawable-nodpi', 'neon_loading_screen.png'));
    }

    patchColors(path.join(resRoot, 'values', 'colors.xml'));
    patchColors(path.join(resRoot, 'values-v31', 'colors.xml'));

    for (const file of listFiles(resRoot)) {
      if (/\/values[^/]*\/(styles|themes)\.xml$/.test(file)) patchStyles(file);
    }

    // Explicit Android 12+ styles so the forced splash is a clean branded icon on dark.
    write(path.join(resRoot, 'values-v31', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowActionBar">false</item>
        <item name="android:windowBackground">@color/splashscreen_background</item>
    </style>
    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/native_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/native_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
    <style name="Theme.App.Starting" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/native_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/native_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
</resources>
`);

    patchManifest(path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml'));
    patchBuildGradle(androidRoot);

    return modConfig;
  }]);
};
