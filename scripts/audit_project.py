import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
questions = json.loads((root / 'src/data/questions.json').read_text())
required_categories = [
  'General Knowledge','Sports','Science','History','Geography','Movies','Music','TV','Gaming','Math','Food & Drink','Pop Culture'
]
errors = []
warnings = []

if len(questions) != 360:
    errors.append(f'Expected 360 questions, found {len(questions)}')

by_cat = {cat: 0 for cat in required_categories}
ids = set()
question_texts = set()
round_fillers = []
for q in questions:
    ids.add(q['id'])
    normalized_question = re.sub(r'\s+', ' ', q.get('question', '').strip().lower())
    if normalized_question in question_texts:
        errors.append(f"Duplicate question text found: {q.get('question')}")
    question_texts.add(normalized_question)
    if re.search(r'round\s+\d+', q.get('question', ''), re.I):
        round_fillers.append(q.get('id', 'unknown'))
    if q['category'] not in by_cat:
        errors.append(f"Unknown category: {q['category']}")
    else:
        by_cat[q['category']] += 1
    for key in ['id','category','subcategory','difficulty','question','answers','correctIndex','explanation','sourceNote','freshnessType','status']:
        if key not in q:
            errors.append(f"Missing {key} in {q.get('id', 'unknown')}")
    if len(q.get('answers', [])) != 4:
        errors.append(f"Question {q.get('id')} does not have 4 answers")
    if q.get('correctIndex') not in [0,1,2,3]:
        errors.append(f"Question {q.get('id')} has invalid correctIndex")
    if q.get('freshnessType') == 'current' and not q.get('retireAfter'):
        warnings.append(f"Current question {q.get('id')} has no retireAfter")

for cat, count in by_cat.items():
    if count != 30:
        errors.append(f'{cat}: expected 30 questions, found {count}')

if len(ids) != len(questions):
    errors.append('Duplicate question IDs found')

if round_fillers:
    errors.append(f'Round-number filler questions found: {", ".join(round_fillers[:10])}')

for forbidden in ['node_modules', 'package-lock.json', 'tsconfig.tsbuildinfo']:
    if (root / forbidden).exists():
        errors.append(f'Forbidden artifact present: {forbidden}')

if (root / 'docs/gui-screenshots').exists():
    errors.append('Generated screenshot folder should not be included: docs/gui-screenshots')

for expected_asset in [
    'assets/brand/trivia-ranch-header-logo.png',
    'assets/brand/trivia-ranch-plaque-logo.png',
    'assets/brand/app-icon.png',
    'assets/brand/adaptive-icon.png',
]:
    if not (root / expected_asset).exists():
        errors.append(f'Missing logo asset: {expected_asset}')

app_json_text = (root / 'app.json').read_text()
for marker in ['./assets/brand/app-icon.png', './assets/brand/adaptive-icon.png']:
    if marker not in app_json_text:
        errors.append(f'Missing app icon config marker: {marker}')

for expected in [
    'docs/PRODUCT_BIBLE.md','docs/BACK_BURNER.md','docs/PHASE_AUDITS.md','docs/REPAIR_PHASE_AUDITS.md','docs/ANDROID_QA_CHECKLIST.md','docs/BACKEND_HARDENING_AUDIT.md','docs/BACKEND_FLOW.md','docs/FRONTEND_GUI_PHASE_AUDIT.md','docs/RANCH_FIGHT_BOARD_AUDIT.md','docs/PRE_QUESTION_STABILITY_AUDIT.md','docs/LOGO_INTEGRATION_AUDIT.md','docs/LOGO_PLACEMENT_CLEANUP_AUDIT.md',
    'supabase/schema.sql','App.tsx','src/services/triviaApi.ts','src/types/env.d.ts'
]:
    if not (root / expected).exists():
        errors.append(f'Missing expected file: {expected}')

app_text = (root / 'App.tsx').read_text()
required_app_markers = [
    'setInterval(() => setTimerNow(Date.now()), 250)',
    'AsyncStorage.setItem(STATS_STORAGE_KEY',
    'TextInput',
    'submitQuestionReport',
    'startOfficialGameSession',
    'submitGameResult',
    'activeSessionId',
    'LinearGradient',
    'dailyHero',
    'gameStatStrip',
    'resultHero',
    'categoryList',
    'categoryRow',
    'RUN HELD',
    'finishLockRef',
    'lastDailyBlitzDate',
    'challenge-enter',
    'reportFlash',
    'brandCompactLogo',
    'brandLogoImage',
    'trivia-ranch-compact-lockup.png',
]
for marker in required_app_markers:
    if marker not in app_text:
        errors.append(f'Missing app implementation marker: {marker}')



# Ranch Fight Board GUI checks: prevent the old bubbly/pill-heavy style from creeping back.
if 'borderRadius: 999' in app_text:
    errors.append('Bubbly pill radius found in App.tsx')
for forbidden_copy in ['One more correct answer would have buried them', 'Backend Status', 'Official Score', 'Local fallback', 'Supabase functions configured']:
    if forbidden_copy in app_text:
        errors.append(f'Forbidden visible/debug copy remains: {forbidden_copy}')
for marker in ['categoryList', 'categoryRow', 'borderLeftWidth: 4', 'progressTrack', 'RUN HELD']:
    if marker not in app_text:
        errors.append(f'Missing Ranch Fight Board marker: {marker}')

colors_text = (root / 'src/theme/colors.ts').read_text()
for marker in ['#070604', 'surfaceRaised', 'ranchGoldBright', 'dangerDim', 'successDim']:
    if marker not in colors_text:
        errors.append(f'Missing GUI theme marker: {marker}')

if not (root / 'src/theme/spacing.ts').exists():
    errors.append('Missing GUI spacing scale: src/theme/spacing.ts')

schema_text = (root / 'supabase/schema.sql').read_text()
for marker in ['enable row level security', 'game_sessions', 'question_reports', 'entitlements', 'questions_category_status_idx', 'official_score', 'assigned_question_ids', 'daily_challenges', 'suspicion_flags', "validation_status = 'official'"]:
    if marker not in schema_text:
        errors.append(f'Missing backend schema marker: {marker}')

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

function_files = [
    'supabase/functions/create-game-session/index.ts',
    'supabase/functions/submit-game-session/index.ts',
    'supabase/functions/create-challenge/index.ts',
    'supabase/functions/submit-challenge/index.ts',
    'supabase/functions/submit-question-report/index.ts',
    'supabase/functions/_shared/scoring.ts',
]
for file in function_files:
    if not (root / file).exists():
        errors.append(f'Missing backend function file: {file}')

if errors:
    print('AUDIT FAILED')
    for error in errors:
        print(f'- {error}')
    raise SystemExit(1)

print('Repair markers present: timer, persistence, editable party names, report flow, remote fallback, server-authoritative score submit, backend schema, edge functions, ranch gold GUI pass, ranch fight board GUI pass, pre-question stability pass, selected logo integration pass.')
