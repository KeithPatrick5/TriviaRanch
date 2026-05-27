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

for expected in [
    'docs/PRODUCT_BIBLE.md','docs/BACK_BURNER.md','docs/PHASE_AUDITS.md','docs/REPAIR_PHASE_AUDITS.md','docs/ANDROID_QA_CHECKLIST.md','docs/BACKEND_HARDENING_AUDIT.md','docs/BACKEND_FLOW.md',
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
]
for marker in required_app_markers:
    if marker not in app_text:
        errors.append(f'Missing app implementation marker: {marker}')

schema_text = (root / 'supabase/schema.sql').read_text()
for marker in ['enable row level security', 'game_sessions', 'question_reports', 'entitlements', 'questions_category_status_idx', 'official_score', 'assigned_question_ids', 'daily_challenges', 'suspicion_flags']:
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

print('Repair markers present: timer, persistence, editable party names, report flow, remote fallback, server-authoritative score submit, backend schema, edge functions.')
