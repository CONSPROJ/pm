-- =====================================================================
-- 0001 — هستهٔ سامانه: کاربران، پروژه‌ها، طرف‌ها، چارت، گروه‌ها،
-- کاتالوگ اجازه‌ها، اعطای اجازه، تنظیمات قابل‌کنترل و گزارش کار.
-- هیچ قانون ثابتی در کد نیست: پیش‌فرض‌ها هم داده‌اند و ادمین تغییرشان می‌دهد.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- کاربران و نشست‌ها ----------
create table users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  display_name  text not null,
  email         text,
  phone         text,
  password_hash text,
  is_root       boolean not null default false,      -- کاربر صفر: بالاتر از هر قاعده
  status        text not null default 'active' check (status in ('active','disabled','pending')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- فقط یک کاربر صفر
create unique index users_one_root on users (is_root) where is_root;

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user on sessions(user_id);

-- ---------- پروژه‌ها ----------
create table projects (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  use_type    text,                 -- کاربری: مسکونی، تجاری، … (فهرستش هم در تنظیمات است)
  phase       text,                 -- مرحله: design1، design2، build، … (قابل تعریف)
  status      text not null default 'active',
  info        jsonb not null default '{}'::jsonb,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

-- ---------- طرف‌ها (سازمان‌ها) ----------
-- نوع طرف‌ها هم داده است، نه کد: کارفرما، مشاور، تیم طراحی، پیمانکار، تأمین‌کننده، مدیریت پروژه، …
create table party_kinds (
  code   text primary key,
  title  text not null,
  sort   int not null default 0
);

create table parties (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  kind         text not null references party_kinds(code),
  name         text not null,
  disciplines  text[] not null default '{}',
  info         jsonb not null default '{}'::jsonb,   -- تماس، نمایندگان، قرارداد، …
  created_at   timestamptz not null default now(),
  unique (project_id, name)
);

-- ---------- چارت سازمانی ----------
create table positions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  parent_id    uuid references positions(id) on delete set null,
  party_id     uuid references parties(id) on delete set null,
  title        text not null,
  disciplines  text[] not null default '{}',
  sort         int not null default 0,
  approved     boolean not null default false,       -- سمت تأییدشده توسط ادمین
  created_at   timestamptz not null default now()
);
create index positions_project on positions(project_id);

-- ---------- عضویت در پروژه ----------
create table memberships (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  position_id  uuid references positions(id) on delete set null,
  party_id     uuid references parties(id) on delete set null,
  level        smallint,                               -- سطح (اختیاری؛ معنای هر سطح هم داده است)
  status       text not null default 'invited' check (status in ('invited','active','left')),
  created_at   timestamptz not null default now(),
  unique (project_id, user_id)
);

-- ---------- گروه‌ها (تیم‌ها) ----------
create table groups (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  description  text,
  unique (project_id, name)
);
create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  primary key (group_id, user_id)
);

-- ---------- کاتالوگ اجازه‌ها ----------
-- هر کاری که در سامانه کنترل‌شدنی است یک «اجازه» است؛ ماژول‌های تازه اجازهٔ خودشان را این‌جا ثبت می‌کنند.
create table capabilities (
  key            text primary key,            -- مثلاً doc.read، doc.design.read، settings.manage
  module         text not null,
  title          text not null,
  description    text,
  default_levels smallint[] not null default '{}',   -- پیش‌فرض اولیه؛ ادمین با grant بازنویسی می‌کند
  constraint_keys text[] not null default '{}'       -- محدودیت‌های قابل تعیین (مثلاً discipline، doc_type)
);

-- ---------- اعطای اجازه ----------
-- موضوع: سطح، سمت چارت، گروه، نوع طرف، طرف مشخص یا فرد. اثر: allow/deny. محدودیت: مثلاً فقط رشتهٔ سازه.
create table grants (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references projects(id) on delete cascade,   -- null یعنی همهٔ پروژه‌ها
  subject_type   text not null check (subject_type in ('level','position','group','party_kind','party','user')),
  subject_id     text not null,
  capability_key text not null references capabilities(key) on delete cascade,
  effect         text not null default 'allow' check (effect in ('allow','deny')),
  constraints    jsonb not null default '{}'::jsonb,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now()
);
create unique index grants_uniq on grants (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_type, subject_id, capability_key);
create index grants_lookup on grants (project_id, capability_key);

-- ---------- تنظیمات و قوانین ----------
-- تعریف هر قاعده (نوع، پیش‌فرض، توضیح) داده است؛ مقدار هر پروژه جداست.
create table setting_defs (
  key          text primary key,
  module       text not null,
  title        text not null,
  description  text,
  value_type   text not null check (value_type in ('number','boolean','text','json','enum')),
  default_value jsonb not null,
  options      jsonb                         -- برای enum: فهرست گزینه‌ها
);
create table settings (
  project_id  uuid references projects(id) on delete cascade,     -- null یعنی کل سامانه
  key         text not null references setting_defs(key) on delete cascade,
  value       jsonb not null,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
create unique index settings_uniq on settings (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

-- ---------- گزارش کار (همهٔ تغییرها، سمت سرور) ----------
create table audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references users(id),
  project_id  uuid references projects(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  data        jsonb not null default '{}'::jsonb,
  ip          text
);
create index audit_project_at on audit_log (project_id, at desc);

-- ---------- دادهٔ اولیه (پیش‌فرض‌ها، همه قابل تغییر) ----------
insert into party_kinds (code, title, sort) values
  ('pm', 'مدیریت پروژه', 1), ('employer', 'کارفرما', 2), ('consultant', 'مشاور / نظارت', 3),
  ('design_team', 'تیم طراحی', 4), ('contractor', 'پیمانکار', 5), ('supplier', 'تأمین‌کننده', 6), ('owner', 'مالک / سرمایه‌گذار', 7);
