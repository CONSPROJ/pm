-- =====================================================================
-- 0005 — امنیت حساب‌ها: قفل پس از تلاش‌های ناموفق، لینک فعال‌سازی یک‌بارمصرف، زمان تغییر رمز
-- =====================================================================
alter table users add column failed_count int not null default 0;
alter table users add column locked_until timestamptz;
alter table users add column password_changed_at timestamptz;

-- دعوت و فعال‌سازی: فقط هش توکن ذخیره می‌شود؛ هر توکن یک بار و تا زمان انقضا
create table user_invites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index user_invites_user on user_invites(user_id);

insert into setting_defs (key, module, title, description, value_type, default_value) values
  ('security.max_failed_logins', 'security', 'تعداد ورود ناموفق تا قفل حساب', null, 'number', '5'),
  ('security.lockout_minutes',   'security', 'مدت قفل حساب (دقیقه)', null, 'number', '15'),
  ('security.invite_days',       'security', 'اعتبار لینک فعال‌سازی (روز)', null, 'number', '7')
on conflict (key) do nothing;
