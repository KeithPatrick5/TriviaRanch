# Trivia Ranch

Android-first trivia fight app.

Fast rounds. Clean dark UI. No forced ads. No web-first detour.

## What is built

- Expo / React Native Android app
- Daily Blitz mode
- Survival mode
- Challenge Run mode
- Pass-the-Phone mode
- 12 main categories
- 360 local seed questions
- Scoring engine
- Streaks, lives, local XP, rank display
- Phase/audit docs
- Supabase schema draft

## Install

```bash
npm install
npm run start
```

Run on Android:

```bash
npm run android
```

Preview Android APK build:

```bash
npm run build:android:preview
```

Production Android App Bundle:

```bash
npm run build:android:production
```

## Local audit

```bash
npm run audit:local
```

## Notes

No `node_modules` are included. No package lock is included. The first build is local-first gameplay so the app can be tested fast before the backend and billing layers are wired in.
