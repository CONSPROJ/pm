-- =====================================================================
-- 0002 — کنترل مدارک (Document Control): رشته‌ها، انواع سند، گردش‌کار
-- قابل‌تعریف، مدارک، ویرایش‌ها، رویدادهای هر ویرایش، ترنسمیتال و MDR.
-- وضعیت‌ها، کدهای پاسخ و گذارها برای هر پروژه داده‌اند، نه کد.
-- =====================================================================

create table disciplines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  code        text not null,               -- ARC، STR، MEC، ELE، …
  name        text not null,
  sort        int not null default 0,
  unique (project_id, code)
);

create table workflows (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  unique (project_id, name)
);
create table workflow_states (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references workflows(id) on delete cascade,
  code         text not null,
  name         text not null,
  category     text not null check (category in ('draft','in_review','returned','approved','closed','void')),
  review_code  text,                        -- A / B / C / D / IFC … (اختیاری، قابل تعریف)
  holder_kind  text references party_kinds(code),   -- در این وضعیت سند نزد کدام طرف است (برای زمان‌سنجی)
  limit_days   int,                         -- مهلت این وضعیت (برای هشدار)؛ null یعنی بی‌مهلت
  sort         int not null default 0,
  unique (workflow_id, code)
);
create table workflow_transitions (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid not null references workflows(id) on delete cascade,
  from_state      uuid references workflow_states(id) on delete cascade,   -- null یعنی شروع
  to_state        uuid not null references workflow_states(id) on delete cascade,
  capability_key  text references capabilities(key),                       -- چه اجازه‌ای لازم است
  unique (workflow_id, from_state, to_state)
);

create table doc_types (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete cascade,
  code             text not null,             -- DWG، CAL، SPC، LTR، MOM، TRN …
  name             text not null,
  workflow_id      uuid references workflows(id) on delete set null,
  numbering        text,                      -- الگوی شماره، مثلاً {PRJ}-{DISC}-{TYPE}-{SEQ:4}
  in_mdr           boolean not null default true,
  unique (project_id, code)
);

create table documents (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete cascade,
  type_id            uuid not null references doc_types(id),
  number             text not null,
  title              text not null,
  discipline_id      uuid references disciplines(id) on delete set null,
  originator_id      uuid references parties(id) on delete set null,     -- طراح / تهیه‌کننده
  -- MDR: برنامه
  planned_issue      date,
  planned_approval   date,
  weight             numeric not null default 1,
  current_state_id   uuid references workflow_states(id),
  info               jsonb not null default '{}'::jsonb,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now(),
  unique (project_id, number)
);
create index documents_project on documents(project_id);

create table revisions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  rev           text not null,                         -- 0، 1، A، B …
  seq           int not null,                          -- ترتیب ویرایش‌ها
  received_at   timestamptz,                           -- دریافت این ویرایش
  state_id      uuid references workflow_states(id),
  review_code   text,
  closed_at     timestamptz,                           -- پاسخ نهایی این ویرایش
  files         jsonb not null default '[]'::jsonb,
  note          text,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (document_id, seq)
);

-- هر تغییر وضعیت یک رویداد؛ زمان ماندن در هر مرحله و نزد هر طرف از همین‌ها حساب می‌شود
create table revision_events (
  id            uuid primary key default gen_random_uuid(),
  revision_id   uuid not null references revisions(id) on delete cascade,
  state_id      uuid not null references workflow_states(id),
  at            timestamptz not null default now(),
  by_user       uuid references users(id),
  holder_party  uuid references parties(id),
  note          text
);
create index revision_events_rev on revision_events(revision_id, at);

-- ارسال مدارک (ترنسمیتال): چه ویرایش‌هایی، از چه طرفی، به چه طرفی، برای چه منظوری
create table transmittals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  number      text not null,
  from_party  uuid references parties(id),
  to_party    uuid references parties(id),
  purpose     text,                          -- برای بررسی، برای اطلاع، برای ساخت …
  sent_at     timestamptz not null default now(),
  due_at      timestamptz,
  note        text,
  created_by  uuid references users(id),
  unique (project_id, number)
);
create table transmittal_items (
  transmittal_id uuid not null references transmittals(id) on delete cascade,
  revision_id    uuid not null references revisions(id) on delete cascade,
  primary key (transmittal_id, revision_id)
);
