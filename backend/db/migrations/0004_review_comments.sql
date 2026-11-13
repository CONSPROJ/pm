-- =====================================================================
-- 0004 — جدول رسیدگی به نظرات (CRS) برای هر مدرک و ویرایش
-- =====================================================================
create table review_comments (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references documents(id) on delete cascade,
  revision_id   uuid references revisions(id) on delete set null,     -- ویرایشی که نظر در آن داده شد
  seq           int not null,                                         -- شمارهٔ نظر در همان مدرک
  party_kind    text references party_kinds(code),                    -- از طرف مشاور، کارفرما، …
  author_id     uuid references users(id),
  author_name   text,
  body          text not null,
  response      text,
  responder_id  uuid references users(id),
  responded_at  timestamptz,
  status        text not null default 'open' check (status in ('open','answered','closed')),
  closed_in_rev uuid references revisions(id) on delete set null,
  closed_by     uuid references users(id),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (document_id, seq)
);
create index review_comments_doc on review_comments(document_id);

insert into capabilities (key, module, title, description, default_levels, constraint_keys) values
  ('doc.comment',       'docs', 'ثبت نظر بررسی (CRS)',           null, '{1,2,3,4}', '{doc_types,disciplines}'),
  ('doc.comment.reply', 'docs', 'پاسخ به نظر بررسی',             'معمولاً تیم طراحی', '{1,2,3,4}', '{doc_types,disciplines,own_party}'),
  ('doc.comment.close', 'docs', 'بستن یا بازگشایی نظر بررسی',     null, '{1,2}', '{doc_types,disciplines}')
on conflict (key) do nothing;
