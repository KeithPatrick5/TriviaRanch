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
    'assets/mockups/neon-home.png',
    'assets/mockups/neon-game.png',
    'assets/mockups/neon-result.png',
    'assets/brand/app-icon.png',
    'assets/brand/adaptive-icon.png',
]:
    if not (root / expected_asset).exists():
        errors.append(f'Missing asset-driven UI asset: {expected_asset}')

app_json_text = (root / 'app.json').read_text()
for marker in ['"name": "Neon Trivia"', '"slug": "neon-trivia"', '"scheme": "neontrivia"', 'com.neontrivia.app', './assets/brand/app-icon.png', './assets/brand/adaptive-icon.png']:
    if marker not in app_json_text:
        errors.append(f'Missing Neon app config marker: {marker}')

package_text = (root / 'package.json').read_text()
if '"name": "neon-trivia"' not in package_text:
    errors.append('package.json was not renamed to neon-trivia')

for expected in [
    'docs/PRODUCT_BIBLE.md','docs/BACK_BURNER.md','docs/PHASE_AUDITS.md','docs/REPAIR_PHASE_AUDITS.md','docs/ANDROID_QA_CHECKLIST.md','docs/BACKEND_HARDENING_AUDIT.md','docs/BACKEND_FLOW.md','docs/PRE_QUESTION_STABILITY_AUDIT.md','docs/NEON_TRIVIA_REBRAND_AUDIT.md',
    'supabase/schema.sql','App.tsx','src/services/triviaApi.ts','src/types/env.d.ts'
]:
    if not (root / expected).exists():
        errors.append(f'Missing expected file: {expected}')

app_text = (root / 'App.tsx').read_text()
required_app_markers = [
    "require('./assets/mockups/neon-home.png')",
    "require('./assets/mockups/neon-game.png')",
    "require('./assets/mockups/neon-result.png')",
    'ImageBackground',
    'MockupScreen',
    'OverlayButton',
    'HIT.homeStart',
    'HIT.answerA',
    'HIT.resultRun',
    'startOfficialGameSession',
    'submitGameResult',
    'submitQuestionReport',
    'createChallengeFromSession',
    'finishLockRef',
    'lastDailyBlitzDate',
    'NEON CREW',
    'Back to Neon Trivia',
]
for marker in required_app_markers:
    if marker not in app_text:
        errors.append(f'Missing app implementation marker: {marker}')

for forbidden_copy in ['Backend Status', 'Official Score', 'Local fallback', 'Supabase functions configured', 'Trivia Ranch', 'TRIVIA RANCH', 'RANCH CREW', 'RANCH-', 'PLAY THINK WIN']:
    if forbidden_copy in app_text or forbidden_copy in app_json_text or forbidden_copy in package_text:
        errors.append(f'Forbidden old/debug visible marker remains: {forbidden_copy}')

schema_text = (root / 'supabase/schema.sql').read_text()
for marker in ['enable row level security', 'game_sessions', 'question_reports', 'entitlements', 'questions_category_status_idx', 'official_score', 'assigned_question_ids', 'daily_challenges', 'suspicion_flags', "validation_status = 'official'"]:
    if marker not in schema_text:
        errors.append(f'Missing backend schema marker: {marker}')

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

print('AUDIT PASSED')
print(f'Questions: {len(questions)}')
for cat in required_categories:
    print(f'- {cat}: {by_cat[cat]}')
if warnings:
    print('Warnings:')
    for warning in warnings:
        print(f'- {warning}')
print('No node_modules, package-lock.json, or tsconfig.tsbuildinfo present.')
print('Asset-driven Neon Trivia mockup build present: approved mockup screens are real app backgrounds with tappable gameplay overlays.')
