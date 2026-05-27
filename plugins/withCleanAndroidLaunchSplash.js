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

function removeGeneratedSplashImages(resRoot) {
  for (const file of listFiles(resRoot)) {
    const base = path.basename(file);
    if (/^splashscreen_logo\.(png|webp|jpg|jpeg)$/i.test(base) || /^splashscreen_image\.(png|webp|jpg|jpeg)$/i.test(base)) {
      try { fs.unlinkSync(file); } catch (_) {}
    }
  }
}

function patchStyleXml(file) {
  if (!fs.existsSync(file)) return;
  let xml = fs.readFileSync(file, 'utf8');

  // Force Android 12+ SplashScreen API to show no icon and only a neutral dark frame.
  const replacements = [
    ['windowSplashScreenAnimatedIcon', '@drawable/splashscreen_logo'],
    ['android:windowSplashScreenAnimatedIcon', '@drawable/splashscreen_logo'],
    ['windowSplashScreenBackground', '@color/splashscreen_background'],
    ['android:windowSplashScreenBackground', '@color/splashscreen_background'],
    ['windowSplashScreenIconBackgroundColor', '@android:color/transparent'],
    ['android:windowSplashScreenIconBackgroundColor', '@android:color/transparent'],
  ];

  for (const [name, value] of replacements) {
    const re = new RegExp(`<item name="${name}">.*?<\\/item>`, 'g');
    if (xml.match(re)) xml = xml.replace(re, `<item name="${name}">${value}</item>`);
  }

  // Legacy splash path: make windowBackground dark only, never icon centered.
  xml = xml.replace(/<item name="android:windowBackground">.*?<\/item>/g, '<item name="android:windowBackground">@drawable/splashscreen</item>');

  // Add missing SplashScreen items to any style that inherits Theme.SplashScreen.
  xml = xml.replace(/(<style[^>]+parent="[^"]*Theme\.SplashScreen[^"]*"[^>]*>)([\s\S]*?)(<\/style>)/g, (match, open, body, close) => {
    const need = [];
    if (!body.includes('windowSplashScreenBackground')) need.push('        <item name="windowSplashScreenBackground">@color/splashscreen_background</item>');
    if (!body.includes('windowSplashScreenAnimatedIcon')) need.push('        <item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>');
    if (!body.includes('windowSplashScreenIconBackgroundColor')) need.push('        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>');
    return `${open}${body}${need.length ? '\n' + need.join('\n') + '\n' : ''}${close}`;
  });

  fs.writeFileSync(file, xml);
}

function patchColors(file) {
  let xml = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';

  if (xml.includes('name="splashscreen_background"')) {
    xml = xml.replace(/<color name="splashscreen_background">.*?<\/color>/g, `<color name="splashscreen_background">${DARK}</color>`);
  } else {
    xml = xml.replace('</resources>', `    <color name="splashscreen_background">${DARK}</color>\n</resources>`);
  }
  fs.writeFileSync(file, xml);
}

module.exports = function withCleanAndroidLaunchSplash(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const root = modConfig.modRequest.platformProjectRoot;
    const resRoot = path.join(root, 'app', 'src', 'main', 'res');

    ensureDir(resRoot);
    removeGeneratedSplashImages(resRoot);

    patchColors(path.join(resRoot, 'values', 'colors.xml'));

    // Transparent splash icon. If any style still asks for splashscreen_logo, this renders nothing.
    write(path.join(resRoot, 'drawable', 'splashscreen_logo.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="1dp"
    android:height="1dp"
    android:viewportWidth="1"
    android:viewportHeight="1">
    <path android:fillColor="#00000000" android:pathData="M0,0h1v1h-1z" />
</vector>
`);

    // Legacy splash background: dark only, no centered icon bitmap.
    write(path.join(resRoot, 'drawable', 'splashscreen.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/splashscreen_background" />
</shape>
`);

    for (const file of listFiles(resRoot)) {
      if (/\/values[^/]*\/styles\.xml$/.test(file)) patchStyleXml(file);
    }

    return modConfig;
  }]);
};
