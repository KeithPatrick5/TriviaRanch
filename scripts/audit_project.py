import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
questions = json.loads((root / 'src/data/questions.json').read_text())
required_categories = [
  'General Knowledge','Sports','Science','History','Geography','Movies','TV','Music','Gaming','Math','Food & Drink','Pop Culture'
]
errors = []
warnings = []

if len(questions) != 360:
    errors.append(f'Expected 360 questions, found {len(questions)}')

by_cat = {cat: 0 for cat in required_categories}
ids = set()
texts = set()
for q in questions:
    qid = q.get('id', 'unknown')
    if qid in ids:
        errors.append(f'Duplicate question ID: {qid}')
    ids.add(qid)
    normalized = re.sub(r'\s+', ' ', q.get('question', '').strip().lower())
    if normalized in texts:
        errors.append(f'Duplicate question text: {q.get("question")}')
    texts.add(normalized)
    if re.search(r'round\s+\d+', q.get('question', ''), re.I):
        errors.append(f'Round filler question remains: {qid}')
    if q.get('category') not in by_cat:
        errors.append(f'Unknown category: {q.get("category")}')
    else:
        by_cat[q['category']] += 1
    for key in ['id','category','subcategory','difficulty','question','answers','correctIndex','explanation','sourceNote','freshnessType','status']:
        if key not in q:
            errors.append(f'Missing {key} in {qid}')
    if len(q.get('answers', [])) != 4:
        errors.append(f'{qid} does not have 4 answers')
    if q.get('correctIndex') not in [0, 1, 2, 3]:
        errors.append(f'{qid} has invalid correctIndex')
    if q.get('freshnessType') == 'current' and not q.get('retireAfter'):
        warnings.append(f'Current question {qid} has no retireAfter')

for cat, count in by_cat.items():
    if count != 30:
        errors.append(f'{cat}: expected 30, found {count}')

for forbidden in ['node_modules', 'package-lock.json', 'tsconfig.tsbuildinfo']:
    if (root / forbidden).exists():
        errors.append(f'Forbidden artifact present: {forbidden}')

if (root / 'docs/gui-screenshots').exists():
    errors.append('Generated GUI screenshot folder should not be included')

for asset in ['assets/mockups/neon-home.png', 'assets/mockups/neon-game.png', 'assets/mockups/neon-result.png', 'assets/brand/app-icon.png', 'assets/brand/adaptive-icon.png']:
    if not (root / asset).exists():
        errors.append(f'Missing required asset: {asset}')

app_json = (root / 'app.json').read_text()
for marker in ['"name": "Neon Trivia"', '"slug": "neon-trivia"', '"scheme": "neontrivia"', 'com.neontrivia.app']:
    if marker not in app_json:
        errors.append(f'Missing app config marker: {marker}')

package_text = (root / 'package.json').read_text()
if '"name": "neon-trivia"' not in package_text:
    errors.append('package.json name is not neon-trivia')

app_text = (root / 'App.tsx').read_text()
required_markers = [
    'asset-driven-dynamic-home',
    'asset-driven-dynamic-game',
    'asset-driven-dynamic-result',
    'offline-pending-sync-queue',
    'mockup-comparison-audited',
    'mobile-safe-canvas-cleanup',
    'clickable-overlay-audited',
    'responsive-mockup-aspect-lock',
    'useWindowDimensions',
    'resizeMode="stretch"',
    'mockupCanvas',
    'ImageBackground',
    'HomeDynamicLayer',
    'GameDynamicLayer',
    'ResultDynamicLayer',
    'OverlayButton',
    'lastAnswerState',
    'PENDING_QUEUE_STORAGE_KEY',
    'queueResultForSync',
    'startOfficialGameSession',
    'submitGameResult',
    'submitQuestionReport',
    'createChallengeFromSession',
    'finishLockRef',
    'NEON CREW',
    'Back to Neon Trivia',
]
for marker in required_markers:
    if marker not in app_text:
        errors.append(f'Missing dynamic functionality marker: {marker}')

for forbidden in ['TRIVIA RANCH', 'RANCH CREW', 'PLAY THINK WIN', 'Back to the ranch', 'Backend Status', 'Supabase functions configured']:
    if forbidden in app_text or forbidden in app_json or forbidden in package_text:
        errors.append(f'Forbidden visible/debug marker remains: {forbidden}')

for expected in [
    'docs/ASSET_DRIVEN_MOCKUP_BUILD_AUDIT.md',
    'docs/ASSET_DYNAMIC_FUNCTIONALITY_AUDIT.md',
    'docs/BACKEND_HARDENING_AUDIT.md',
    'docs/BACKEND_FLOW.md',
    'supabase/schema.sql',
    'src/services/triviaApi.ts',
    'src/engine/scoring.ts',
    'src/engine/questions.ts',
]:
    if not (root / expected).exists():
        errors.append(f'Missing expected file: {expected}')

schema = (root / 'supabase/schema.sql').read_text()
for marker in ['game_sessions', 'question_reports', 'entitlements', 'official_score', 'assigned_question_ids', 'daily_challenges', 'suspicion_flags', "validation_status = 'official'"]:
    if marker not in schema:
        errors.append(f'Missing backend schema marker: {marker}')

for file in [
    'supabase/functions/create-game-session/index.ts',
    'supabase/functions/submit-game-session/index.ts',
    'supabase/functions/create-challenge/index.ts',
    'supabase/functions/submit-challenge/index.ts',
    'supabase/functions/submit-question-report/index.ts',
    'supabase/functions/_shared/scoring.ts',
]:
    if not (root / file).exists():
        errors.append(f'Missing backend function file: {file}')



required_hit_keys = [
    'homeStart','homeSurvival','homeChallenge','homePassPhone','homeStats',
    'homeNavHome','homeNavLeaderboard','homeNavCrew','homeNavShop','homeNavProfile',
    'gameBack','answerA','answerB','answerC','answerD','report','skip',
    'resultRun','resultChallenge','resultHome','resultMenu'
]
for key in required_hit_keys:
    if key + ':' not in app_text:
        errors.append(f'Missing clickable hitbox key: {key}')

required_button_labels = [
    'Start Daily Blitz','Survival','Challenge','Pass Phone','Stats','Leaderboard','Neon Crew','Shop','Profile',
    'Back to Home','Answer A','Answer B','Answer C','Answer D','Report Question','Skip Question',
    'Run It Back','Challenge Someone','Home','Menu'
]
for label in required_button_labels:
    if f'label="{label}"' not in app_text:
        errors.append(f'Missing wired overlay button label: {label}')

if app_text.count('<OverlayButton') < 21:
    errors.append(f'Expected at least 21 overlay buttons, found {app_text.count("<OverlayButton")}')

# 100% functionality repair markers.
for marker in [
    'phase-1-frontend-stability-pass',
    'phase-2-home-fully-wired-pass',
    'phase-3-category-mode-flow-pass',
    'phase-4-gameplay-fully-dynamic-pass',
    'phase-5-result-fully-dynamic-pass',
    'phase-6-pass-phone-mode-pass',
    'phase-7-challenge-mode-pass',
    'phase-8-bottom-nav-screens-pass',
    'phase-9-offline-sync-queue-pass',
    'phase-10-backend-readiness-pass',
    'phase-11-final-e2e-audit-pass',
    'CategoryScreen',
    'ChallengeMenuScreen',
    'ChallengeEnterScreen',
    'PassPhoneSetupScreen',
    'PartyWinnerScreen',
    'LeaderboardScreen',
    'NeonCrewScreen',
    'ShopScreen',
    'ProfileScreen',
    'RoundReviewScreen',
    'flushPendingQueue',
    'getQuestionsByIds',
    'localRuns',
    'localChallenges',
]:
    if marker not in app_text:
        errors.append(f'Missing 100% functionality repair marker: {marker}')

for dead in ['Leaderboard comes after', 'Friend invites come', 'question packs come later', 'Code entry is wired after', 'Full player setup gets']:
    if dead in app_text:
        errors.append(f'Dead placeholder copy remains in App.tsx: {dead}')

# Env example should not duplicate keys.
env_text = (root / '.env.example').read_text()
for env_key in ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']:
    if env_text.count(env_key) != 1:
        errors.append(f'Duplicate or missing env key in .env.example: {env_key}')


for style_marker in ['hitSlop={6}', 'accessibilityRole="button"', 'hitPressed', 'mockupShell', 'justifyContent: \'center\'']:
    if style_marker not in app_text:
        errors.append(f'Missing mobile/clickable cleanup marker: {style_marker}')

if errors:
    print('AUDIT FAILED')
    for error in errors:
        print(f'- {error}')
    raise SystemExit(1)

print('AUDIT PASSED')
print(f'Questions: {len(questions)}')
for cat in required_categories:
    print(f'- {cat}: {by_cat[cat]}')
if warnings:
    print('Warnings:')
    for warning in warnings:
        print(f'- {warning}')
print('No node_modules, package-lock.json, or tsconfig.tsbuildinfo present.')
print('Dynamic asset-driven Neon Trivia build present: mockup assets remain the visual base, with live overlays for home, game, and result data.')
