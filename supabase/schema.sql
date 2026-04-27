create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  event_type text not null default '',
  goals text not null default '',
  constraints text not null default '',
  recovery_notes text not null default '',
  training_days text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('strava', 'trainerroad')),
  external_athlete_id text,
  encrypted_secret text not null default '',
  status text not null default 'connected',
  scopes text not null default '',
  expires_at bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null,
  message text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.provider_activities (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_activity_id text not null,
  canonical_activity_id bigint,
  name text not null,
  sport_type text not null,
  started_at timestamptz not null,
  duration_seconds integer not null default 0,
  distance_meters double precision,
  tss double precision,
  estimated_load double precision,
  intensity_factor double precision,
  normalized_power double precision,
  kilojoules double precision,
  workout_category text,
  external_url text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_activity_id)
);

create table if not exists public.canonical_activities (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sport_type text not null,
  started_at timestamptz not null,
  duration_seconds integer not null default 0,
  distance_meters double precision,
  source_priority text not null default 'merged',
  tss double precision,
  estimated_load double precision,
  workout_category text,
  merge_confidence double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.provider_connections enable row level security;
alter table public.sync_runs enable row level security;
alter table public.provider_activities enable row level security;
alter table public.canonical_activities enable row level security;
alter table public.question_answers enable row level security;

create policy "profiles own rows" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "connections own rows" on public.provider_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sync runs own rows" on public.sync_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "provider activities own rows" on public.provider_activities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "canonical activities own rows" on public.canonical_activities for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "answers own rows" on public.question_answers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
