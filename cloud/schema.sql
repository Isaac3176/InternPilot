-- InternPilot — cloud (Supabase / Postgres) schema
-- Mirrors the local SQLite model, but every row is owned by a user and
-- protected by Row-Level Security so each account only ever sees its own data.
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Safe to re-run (idempotent-ish: uses IF NOT EXISTS / CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- Helper: standard owner column + RLS policy applied to every table.
-- We default user_id to the caller (auth.uid()) so inserts don't need to set it.
-- ---------------------------------------------------------------------------

create table if not exists companies (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  website    text,
  industry   text,
  size       text,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists resume_versions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  file_path   text,
  content     text,
  target_role text,
  created_at  timestamptz not null default now()
);

create table if not exists applications (
  id                bigint generated always as identity primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id        bigint references companies(id) on delete set null,
  role_title        text not null,
  job_link          text,
  location          text,
  status            text not null default 'interested',
  date_saved        timestamptz not null default now(),
  date_applied      date,
  resume_version_id bigint references resume_versions(id) on delete set null,
  job_description   text,
  notes             text,
  referral          text,
  created_at        timestamptz not null default now()
);

-- Recruiting-diagnostics signals (v11). Idempotent so re-running is safe.
alter table applications add column if not exists discovered_at     timestamptz;
alter table applications add column if not exists applied_at        timestamptz;
alter table applications add column if not exists posting_posted_at timestamptz;
alter table applications add column if not exists match_score       integer;
alter table applications add column if not exists eligibility       text;
alter table applications add column if not exists source            text;
alter table applications add column if not exists company_priority  text;
alter table applications add column if not exists furthest_stage    text;
alter table applications add column if not exists result_date       timestamptz;

-- Exactly what you answered to each application's screening questions (v11).
create table if not exists application_answers (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint not null references applications(id) on delete cascade,
  category       text,
  question       text not null,
  answer         text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_appans_app on application_answers(application_id);
create index if not exists idx_appans_cat on application_answers(category);

-- OA debriefs: a structured post-mortem per assessment (v12).
create table if not exists oa_attempts (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint references applications(id) on delete set null,
  company        text,
  role_title     text,
  taken_on       date,
  duration_min   integer,
  num_questions  integer,
  questions      jsonb,
  primary_lesson text,
  next_rule      text,
  topics_review  jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_oa_app on oa_attempts(application_id);

-- Prep Engine: one row per coding problem attempt (v13).
create table if not exists coding_problems (
  id               bigint generated always as identity primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null,
  url              text,
  difficulty       text,
  patterns         jsonb,
  result           text,
  time_minutes     integer,
  hints_used       integer,
  solution_quality text,
  confidence       integer,
  failure_reasons  jsonb,
  source           text,
  solved_at        timestamptz,
  next_review_at   timestamptz,
  review_stage     integer,
  created_at       timestamptz not null default now()
);
create index if not exists idx_cp_review on coding_problems(next_review_at);

create table if not exists resume_bullets (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  experience_name text,
  original_text   text,
  improved_text   text,
  tags            text,
  application_id  bigint references applications(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists interviews (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint references applications(id) on delete cascade,
  type           text,
  date           date,
  prep_status    text,
  prep_plan      text,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists interview_experiences (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id bigint references companies(id) on delete cascade,
  source     text,
  role       text,
  summary    text,
  topics     text,
  difficulty text,
  created_at timestamptz not null default now()
);

create table if not exists emails (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gmail_id       text,
  sender         text,
  subject        text,
  body           text,
  received_at    timestamptz,
  classification text,
  confidence     real,
  application_id bigint references applications(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists tasks (
  id             bigint generated always as identity primary key,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint references applications(id) on delete cascade,
  title          text not null,
  due_date       date,
  status         text not null default 'open',
  created_at     timestamptz not null default now()
);

create table if not exists contacts (
  id                    bigint generated always as identity primary key,
  user_id               uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id            bigint references companies(id) on delete set null,
  name                  text not null,
  title                 text,
  team                  text,
  email                 text,
  linkedin              text,
  relationship_type     text,
  relationship_strength integer,
  how_you_know          text,
  contact_again         integer not null default 0,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists referrals (
  id                bigint generated always as identity primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id        bigint references contacts(id) on delete set null,
  application_id    bigint references applications(id) on delete set null,
  company_id        bigint references companies(id) on delete set null,
  status            text not null default 'not_started',
  first_contacted   date,
  last_interaction  date,
  next_follow_up    date,
  confirmation_note text,
  referral_link     text,
  thank_you_sent    integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Employment history per contact — preserves one person as they change companies,
-- so best-path scoring can use both current and historical shared-employer paths.
create table if not exists contact_employment_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id   bigint not null references contacts(id) on delete cascade,
  company      text not null,
  title        text,
  team         text,
  start_date   date,
  end_date     date,
  is_current   integer not null default 0,
  source       text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_ceh_contact on contact_employment_history(contact_id);
create index if not exists idx_ceh_company on contact_employment_history(company);

-- One profile row per user (all the autofill + preference fields).
create table if not exists profiles (
  user_id             uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  first_name          text, last_name text, email text, phone text, address text,
  current_city        text, current_state text, current_country text,
  linkedin_url        text, github_url text, portfolio_url text,
  school              text, degree text, major text, minor text, gpa text,
  graduation_date     text, grad_year text,
  work_auth           text, authorized_us text, requires_sponsorship text, security_clearance text,
  gender              text, race_ethnicity text, hispanic_latino text, veteran_status text, disability_status text,
  desired_salary      text, willing_to_relocate text, earliest_start_date text,
  target_roles        text, locations text, skills text, remote_pref text, target_date text,
  preferred_resume_id bigint references resume_versions(id) on delete set null,
  onboarded           integer not null default 0,
  updated_at          timestamptz not null default now()
);

-- Key/value store for things the desktop keeps in localStorage today
-- (watchlist, ranking prefs, adaptive learning, answer vault, feedback).
create table if not exists user_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key     text not null,
  value   jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idx_applications_user   on applications(user_id);
create index if not exists idx_applications_status on applications(user_id, status);
create index if not exists idx_companies_user      on companies(user_id);
create index if not exists idx_contacts_user       on contacts(user_id);
create index if not exists idx_referrals_user      on referrals(user_id);

-- ---------------------------------------------------------------------------
-- Owned foreign keys: RLS hides other users' rows, but normal foreign keys only
-- check that a referenced id exists. These triggers reject cross-account links
-- so clients cannot attach their rows to another user's data or infer ids from
-- FK success/failure behavior.
-- ---------------------------------------------------------------------------
create or replace function app_private_owned_row_exists(table_name text, row_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare ok boolean;
begin
  if row_id is null then
    return true;
  end if;
  if table_name not in (
    'applications',
    'companies',
    'contacts',
    'resume_versions'
  ) then
    raise exception 'unsupported owned reference table';
  end if;

  execute format('select exists(select 1 from %I where id = $1 and user_id = auth.uid())', table_name)
    into ok
    using row_id;
  return coalesce(ok, false);
end;
$$;

create or replace function app_private_assert_application_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('companies', new.company_id) then
    raise exception 'company_id must reference one of your companies';
  end if;
  if not app_private_owned_row_exists('resume_versions', new.resume_version_id) then
    raise exception 'resume_version_id must reference one of your resumes';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_application_answer_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_resume_bullet_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_interview_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_interview_experience_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('companies', new.company_id) then
    raise exception 'company_id must reference one of your companies';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_email_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_task_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_contact_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('companies', new.company_id) then
    raise exception 'company_id must reference one of your companies';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_referral_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('contacts', new.contact_id) then
    raise exception 'contact_id must reference one of your contacts';
  end if;
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  if not app_private_owned_row_exists('companies', new.company_id) then
    raise exception 'company_id must reference one of your companies';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_contact_history_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('contacts', new.contact_id) then
    raise exception 'contact_id must reference one of your contacts';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_profile_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('resume_versions', new.preferred_resume_id) then
    raise exception 'preferred_resume_id must reference one of your resumes';
  end if;
  return new;
end;
$$;

create or replace function app_private_assert_oa_attempt_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app_private_owned_row_exists('applications', new.application_id) then
    raise exception 'application_id must reference one of your applications';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assert_application_refs on applications;
create trigger trg_assert_application_refs
before insert or update of company_id, resume_version_id on applications
for each row execute function app_private_assert_application_refs();

drop trigger if exists trg_assert_application_answer_refs on application_answers;
create trigger trg_assert_application_answer_refs
before insert or update of application_id on application_answers
for each row execute function app_private_assert_application_answer_refs();

drop trigger if exists trg_assert_resume_bullet_refs on resume_bullets;
create trigger trg_assert_resume_bullet_refs
before insert or update of application_id on resume_bullets
for each row execute function app_private_assert_resume_bullet_refs();

drop trigger if exists trg_assert_interview_refs on interviews;
create trigger trg_assert_interview_refs
before insert or update of application_id on interviews
for each row execute function app_private_assert_interview_refs();

drop trigger if exists trg_assert_interview_experience_refs on interview_experiences;
create trigger trg_assert_interview_experience_refs
before insert or update of company_id on interview_experiences
for each row execute function app_private_assert_interview_experience_refs();

drop trigger if exists trg_assert_email_refs on emails;
create trigger trg_assert_email_refs
before insert or update of application_id on emails
for each row execute function app_private_assert_email_refs();

drop trigger if exists trg_assert_task_refs on tasks;
create trigger trg_assert_task_refs
before insert or update of application_id on tasks
for each row execute function app_private_assert_task_refs();

drop trigger if exists trg_assert_contact_refs on contacts;
create trigger trg_assert_contact_refs
before insert or update of company_id on contacts
for each row execute function app_private_assert_contact_refs();

drop trigger if exists trg_assert_referral_refs on referrals;
create trigger trg_assert_referral_refs
before insert or update of contact_id, application_id, company_id on referrals
for each row execute function app_private_assert_referral_refs();

drop trigger if exists trg_assert_contact_history_refs on contact_employment_history;
create trigger trg_assert_contact_history_refs
before insert or update of contact_id on contact_employment_history
for each row execute function app_private_assert_contact_history_refs();

drop trigger if exists trg_assert_profile_refs on profiles;
create trigger trg_assert_profile_refs
before insert or update of preferred_resume_id on profiles
for each row execute function app_private_assert_profile_refs();

drop trigger if exists trg_assert_oa_attempt_refs on oa_attempts;
create trigger trg_assert_oa_attempt_refs
before insert or update of application_id on oa_attempts
for each row execute function app_private_assert_oa_attempt_refs();

revoke execute on function app_private_owned_row_exists(text, bigint) from public, anon, authenticated;
revoke execute on function app_private_assert_application_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_application_answer_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_resume_bullet_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_interview_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_interview_experience_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_email_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_task_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_contact_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_referral_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_contact_history_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_profile_refs() from public, anon, authenticated;
revoke execute on function app_private_assert_oa_attempt_refs() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-Level Security: every table is owner-scoped to auth.uid().
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','resume_versions','applications','application_answers','resume_bullets','interviews',
    'interview_experiences','emails','tasks','contacts','referrals',
    'contact_employment_history','profiles','user_settings','oa_attempts','coding_problems'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
    execute format(
      'create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t);
  end loop;
end $$;
