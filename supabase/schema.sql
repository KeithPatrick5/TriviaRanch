-- Trivia Ranch backend schema, hardened MVP.
-- Goal: keep gameplay fast while making official scores server-authoritative.
-- Public clients should not directly write trusted leaderboard/session records.

create extension if not exists pgcrypto;

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
  session_token text not null default encode(gen_random_bytes(18), 'hex'),
  user_id text references users(id),
  mode text not null check (mode in ('daily-blitz', 'survival', 'pass-the-phone', 'challenge')),
  category text not null,
  seed integer not null default 1,
  assigned_question_ids jsonb not null default '[]'::jsonb,
  client_score integer not null default 0,
  official_score integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  skipped_count integer not null default 0,
  max_streak integer not null default 0,
  duration_ms integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  suspicion_flags jsonb not null default '[]'::jsonb,
  validation_status text not null default 'pending' check (validation_status in ('pending', 'official', 'flagged', 'rejected', 'expired')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null,
  category text not null,
  question_ids jsonb not null,
  seed integer not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  unique(challenge_date, category)
);

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_code text not null unique,
  creator_user_id text references users(id),
  opponent_user_id text references users(id),
  category text not null,
  seed integer not null,
  question_ids jsonb not null default '[]'::jsonb,
  creator_session_id uuid references game_sessions(id),
  opponent_session_id uuid references game_sessions(id),
  creator_official_score integer,
  opponent_official_score integer,
  winner_user_id text references users(id),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'cancelled')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table if not exists question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id text references questions(id),
  user_id text references users(id),
  reason text not null check (reason in ('needs_review', 'wrong_answer', 'outdated', 'duplicate', 'bad_wording', 'too_easy', 'too_hard', 'offensive')),
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
create index if not exists game_sessions_official_score_idx on game_sessions(category, official_score desc) where validation_status in ('official', 'flagged');
create index if not exists game_sessions_validation_idx on game_sessions(validation_status, created_at desc);
create index if not exists daily_challenges_date_category_idx on daily_challenges(challenge_date, category);
create index if not exists challenges_code_idx on challenges(challenge_code);
create index if not exists challenges_creator_status_idx on challenges(creator_user_id, status);
create index if not exists reports_status_created_idx on question_reports(status, created_at desc);

alter table users enable row level security;
alter table questions enable row level security;
alter table game_sessions enable row level security;
alter table daily_challenges enable row level security;
alter table challenges enable row level security;
alter table question_reports enable row level security;
alter table entitlements enable row level security;

-- Client-readable data. Writes to trusted score/challenge tables are performed by Edge Functions using the service role key.
do $$ begin
  create policy "read active questions" on questions for select using (status = 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read active daily challenges" on daily_challenges for select using (status = 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "upsert anonymous users" on users for insert with check (id like 'anon-%' or id = 'local-player');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read public anonymous profiles" on users for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read official leaderboard sessions" on game_sessions for select using (validation_status in ('official', 'flagged'));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "read open challenges" on challenges for select using (status in ('open', 'completed'));
exception when duplicate_object then null; end $$;

-- Reports are low-risk, but production should still rate-limit in the Edge Function.
do $$ begin
  create policy "submit question reports only" on question_reports for insert with check (reason in ('needs_review', 'wrong_answer', 'outdated', 'duplicate', 'bad_wording', 'too_easy', 'too_hard', 'offensive'));
exception when duplicate_object then null; end $$;

-- No public insert/update policy exists for game_sessions, challenges, daily_challenges, or entitlements.
-- Official game flow must go through Edge Functions:
-- create-game-session -> submit-game-session -> create-challenge/submit-challenge.

create or replace function increment_question_report_count(question_id_input text)
returns void
language plpgsql
security definer
as $$
begin
  update questions
  set report_count = report_count + 1,
      updated_at = now()
  where id = question_id_input;
end;
$$;
