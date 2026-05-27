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

function emptyVectorXml() {
  // Do not draw a path. Android 12's splash screen can still paint a masked icon
  // background if an adaptive/launcher icon is used. A true empty vector plus a
  // dark icon background prevents the white-circle native splash flash.
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="1dp"
    android:height="1dp"
    android:viewportWidth="1"
    android:viewportHeight="1" />
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

function patchStyleBody(body) {
  const items = {
    'android:windowBackground': '@drawable/splashscreen',
    'android:colorAccent': '@color/splashscreen_background',
    windowSplashScreenBackground: '@color/splashscreen_background',
    'android:windowSplashScreenBackground': '@color/splashscreen_background',
    windowSplashScreenAnimatedIcon: '@drawable/transparent_splash_icon',
    'android:windowSplashScreenAnimatedIcon': '@drawable/transparent_splash_icon',
    windowSplashScreenIconBackgroundColor: '@color/splashscreen_background',
    'android:windowSplashScreenIconBackgroundColor': '@color/splashscreen_background',
    windowSplashScreenBrandingImage: '@drawable/transparent_splash_icon',
    'android:windowSplashScreenBrandingImage': '@drawable/transparent_splash_icon',
  };

  let patched = body;
  for (const [name, value] of Object.entries(items)) {
    patched = setOrAddItem(patched, name, value);
  }
  if (!patched.includes('postSplashScreenTheme')) {
    patched = `${patched}\n        <item name="postSplashScreenTheme">@style/AppTheme</item>`;
  }
  return patched;
}

function patchStyleXml(file) {
  let xml = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';

  let touched = false;

  // Patch every existing splash/launch theme. Expo/React Native names vary by SDK/template.
  xml = xml.replace(/(<style[^>]+name="[^"]*(?:Splash|Launch|Starting)[^"]*"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    touched = true;
    return `${open}${patchStyleBody(body)}\n    ${close}`;
  });

  // Some templates only have AppTheme at launch; patch it too so the system cannot fall back to launcher icon.
  xml = xml.replace(/(<style[^>]+name="AppTheme"[^>]*>)([\s\S]*?)(<\/style>)/gi, (match, open, body, close) => {
    return `${open}${setOrAddItem(body, 'android:windowBackground', '@drawable/splashscreen')}\n    ${close}`;
  });

  if (!xml.includes('name="Theme.App.SplashScreen"')) {
    touched = true;
    xml = xml.replace('</resources>', `    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">\n${patchStyleBody('')}\n    </style>\n</resources>`);
  }

  if (!xml.includes('name="Theme.App.Starting"')) {
    touched = true;
    xml = xml.replace('</resources>', `    <style name="Theme.App.Starting" parent="Theme.SplashScreen">\n${patchStyleBody('')}\n    </style>\n</resources>`);
  }

  fs.writeFileSync(file, xml);
}

function patchManifest(file) {
  if (!fs.existsSync(file)) return;
  let xml = fs.readFileSync(file, 'utf8');

  // Keep launcher icons for the app drawer where possible, but force MainActivity to use our splash theme.
  xml = xml.replace(/(<activity[^>]+android:name="\.MainActivity"[\s\S]*?)(android:theme="[^"]*")/m, '$1android:theme="@style/Theme.App.SplashScreen"');

  // If MainActivity somehow has no theme attribute, add it.
  xml = xml.replace(/(<activity[^>]+android:name="\.MainActivity"(?![\s\S]*?android:theme=)[^>]*)(>)/m, '$1 android:theme="@style/Theme.App.SplashScreen"$2');

  fs.writeFileSync(file, xml);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const root = modConfig.modRequest.platformProjectRoot;
    const resRoot = path.join(root, 'app', 'src', 'main', 'res');

    ensureDir(resRoot);

    // True transparent drawable used for Android 12+ native splash icon/branding.
    write(path.join(resRoot, 'drawable', 'transparent_splash_icon.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable', 'empty_splash_icon.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable', 'splashscreen_logo.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable', 'ic_launcher_foreground.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable', 'ic_launcher_round.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable', 'splashscreen.xml'), darkShapeXml());

    // Some Android templates use drawable-v31 resources for Android 12 splash.
    write(path.join(resRoot, 'drawable-v31', 'transparent_splash_icon.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable-v31', 'empty_splash_icon.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable-v31', 'splashscreen_logo.xml'), emptyVectorXml());
    write(path.join(resRoot, 'drawable-v31', 'splashscreen.xml'), darkShapeXml());

    patchColors(path.join(resRoot, 'values', 'colors.xml'));
    patchColors(path.join(resRoot, 'values-v31', 'colors.xml'));

    // Patch generated styles/themes, then force explicit v31 overrides.
    for (const file of listFiles(resRoot)) {
      if (/\/values[^/]*\/(styles|themes)\.xml$/.test(file)) patchStyleXml(file);
    }

    write(path.join(resRoot, 'values-v31', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@color/splashscreen_background</item>
        <item name="windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowBackground">@drawable/splashscreen</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
    <style name="Theme.App.Starting" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenBackground">@color/splashscreen_background</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/transparent_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@color/splashscreen_background</item>
        <item name="android:windowSplashScreenIconBackgroundColor">@color/splashscreen_background</item>
        <item name="windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowSplashScreenBrandingImage">@drawable/transparent_splash_icon</item>
        <item name="android:windowBackground">@drawable/splashscreen</item>
        <item name="postSplashScreenTheme">@style/AppTheme</item>
    </style>
</resources>
`);

    patchManifest(path.join(root, 'app', 'src', 'main', 'AndroidManifest.xml'));

    return modConfig;
  }]);
};
