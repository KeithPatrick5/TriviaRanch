-- Trivia Ranch backend schema scaffold.
-- Safe for a fresh Supabase project. Uses text user IDs so anonymous Android IDs can submit scores before full auth exists.

create table if not exists users (
  id text primary key,
  display_name text not null default 'Ranch Hand',
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists questions (
  id text primary key,
  category text not null,
  subcategory text not null,
  difficulty integer not null check (difficulty between 1 and 5),
  question text not null,
  answers jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null,
  source_note text not null,
  freshness_type text not null check (freshness_type in ('static', 'semi-static', 'current')),
  retire_after date,
  status text not null default 'active' check (status in ('active', 'review', 'retired')),
  times_seen integer not null default 0,
  correct_count integer not null default 0,
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id),
  mode text not null,
  category text not null,
  score integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  skipped_count integer not null default 0,
  max_streak integer not null default 0,
  duration_ms integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  validation_status text not null default 'client_submitted',
  created_at timestamptz not null default now()
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  creator_user_id text references users(id),
  opponent_user_id text references users(id),
  category text not null,
  seed integer not null,
  creator_session_id uuid references game_sessions(id),
  opponent_session_id uuid references game_sessions(id),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'cancelled')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table if not exists question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id text references questions(id),
  user_id text references users(id),
  reason text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'fixed', 'retired', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id),
  product_id text not null,
  platform text not null default 'android',
  status text not null check (status in ('active', 'expired', 'refunded', 'grace_period')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_category_status_idx on questions(category, status);
create index if not exists game_sessions_user_created_idx on game_sessions(user_id, created_at desc);
create index if not exists game_sessions_category_score_idx on game_sessions(category, score desc);
create index if not exists challenges_creator_status_idx on challenges(creator_user_id, status);
create index if not exists reports_status_created_idx on question_reports(status, created_at desc);

alter table users enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table challenges enable row level security;
alter table question_reports enable row level security;
alter table entitlements enable row level security;

-- Public anonymous MVP policies. Tighten these before public launch if Supabase becomes the production backend.
do $$ begin
  create policy "read active questions" on questions for select using (status = 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "upsert anonymous users" on users for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read own anonymous user" on users for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submit game sessions" on game_sessions for insert with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "submit question reports" on question_reports for insert with check (true);
exception when duplicate_object then null; end $$;
