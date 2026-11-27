-- ۶۷۹: گفت‌وگو — امنیت پیام‌ها، گروه‌ها و وضعیت آنلاین
-- یک بار در Supabase (SQL Editor) اجرا شود. تکرارِ اجرا بی‌خطر است.
--
-- ۱) پیام خصوصی: فقط فرستنده و گیرنده می‌بینند. گیرنده فقط «خوانده شد» را عوض می‌کند،
--    نه متن را؛ حذف و ویرایش فقط با فرستنده (یا مدیر سامانه).
-- ۲) گفت‌وگوی عمومی: همهٔ اعضای همان پروژه.
-- ۳) گروه: فقط اعضای گروه پیام را می‌بینند و می‌فرستند. گروه را سازنده (یا مدیر) ویرایش و حذف می‌کند؛
--    عضو فقط می‌تواند خودش را بیرون ببرد.
-- ۴) آنلاین: هر کاربر فقط حضور خودش را ثبت می‌کند؛ فهرست با RPC خوانده می‌شود.

-- عضویت در گفت‌وگو (برای پیام‌ها)
create or replace function public.pm_chat_can(p_to text) returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare me text := public.pm_me(); gid text; ok boolean := false;
begin
  if me is null or p_to is null then return false; end if;
  if p_to = me or p_to = 'گفت‌وگوی عمومی' then return true; end if;
  if left(p_to, 5) = 'گروه:' then
    gid := substr(p_to, 6);
    begin
      select exists(
        select 1 from public.lists
         where kind = 'گروه گفت‌وگو'
           and split_part(value, '¦', 1) = gid
           and (split_part(value, '¦', 2))::jsonb -> 'm' ? me) into ok;
    exception when others then ok := false; end;
    return ok;
  end if;
  return false;
end $$;
revoke all on function public.pm_chat_can(text) from public;
grant execute on function public.pm_chat_can(text) to anon, authenticated;

alter table public.nudges enable row level security;
select public._pm_drop_policies('nudges');
create policy "pm nudges read" on public.nudges for select
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or public.pm_chat_can(to_name)));
create policy "pm nudges insert" on public.nudges for insert
  with check ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or (from_name = (select public.pm_me())
            and (left(to_name, 5) <> 'گروه:' or public.pm_chat_can(to_name)))));
create policy "pm nudges update" on public.nudges for update
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or to_name = (select public.pm_me())
          or (select public.pm_is_admin())))
  with check ((select public.pm_me()) is not null);
create policy "pm nudges delete" on public.nudges for delete
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or (select public.pm_is_admin())));
grant select, insert, update, delete on public.nudges to anon, authenticated;

-- گیرنده فقط «خوانده شد» را عوض می‌کند؛ فرستنده، گیرنده و نوع پیام هرگز عوض نمی‌شوند
create or replace function public.pm_msg_guard() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me();
begin
  if old.kind is distinct from 'پیام' and new.kind is distinct from 'پیام' then return new; end if;
  if new.kind is distinct from old.kind or new.from_name is distinct from old.from_name or new.to_name is distinct from old.to_name then
    raise exception 'فرستنده، گیرنده و نوع پیام قابل تغییر نیست.';
  end if;
  if me is distinct from old.from_name and not public.pm_is_admin() then
    if new.message is distinct from old.message or new.title is distinct from old.title or new.item_id is distinct from old.item_id then
      raise exception 'فقط فرستنده می‌تواند پیام را ویرایش یا حذف کند.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pm_msg_guard on public.nudges;
create trigger pm_msg_guard before update on public.nudges for each row execute function public.pm_msg_guard();

-- گروه‌ها: lists «گروه گفت‌وگو»، مقدار «شناسه¦{"n":نام,"m":[اعضا],"by":سازنده}»
create or replace function public.pm_chat_group_guard() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me(); o jsonb; n jsonb;
begin
  if tg_op = 'INSERT' then
    if new.kind is distinct from 'گروه گفت‌وگو' then return new; end if;
    n := (split_part(new.value, '¦', 2))::jsonb;
    if me is null or ((n->>'by' is distinct from me or not (n->'m' ? me)) and not public.pm_is_admin()) then raise exception 'سازندهٔ گروه باید خودِ کاربر و عضو گروه باشد.'; end if;
    return new;
  end if;
  if old.kind is distinct from 'گروه گفت‌وگو' then return coalesce(new, old); end if;
  o := (split_part(old.value, '¦', 2))::jsonb;
  if me is not null and (o->>'by' = me or public.pm_is_admin()) then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and me is not null and coalesce(current_setting('pm.chat_leave', true), '') = me then return new; end if;
  raise exception 'فقط سازندهٔ گروه یا مدیر سامانه می‌تواند گروه را تغییر دهد.';
end $$;
drop trigger if exists pm_chat_group_guard on public.lists;
create trigger pm_chat_group_guard before insert or update or delete on public.lists
  for each row execute function public.pm_chat_group_guard();

-- ثبت دوبارهٔ گروه پس از «خروج» عضو: همان سازنده و اعضای قبلی منهای خودش
create or replace function public.pm_chat_group_leave(p_gid text) returns boolean
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me(); r record; o jsonb; m jsonb;
begin
  if me is null then return false; end if;
  select * into r from public.lists where kind = 'گروه گفت‌وگو' and split_part(value, '¦', 1) = p_gid limit 1;
  if not found then return false; end if;
  o := (split_part(r.value, '¦', 2))::jsonb;
  if not (o->'m' ? me) then return false; end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into m from jsonb_array_elements(o->'m') x where x #>> '{}' <> me;
  perform set_config('pm.chat_leave', me, true);
  update public.lists set value = p_gid || '¦' || jsonb_set(o, '{m}', m)::text where kind = r.kind and value = r.value;
  perform set_config('pm.chat_leave', '', true);
  return true;
end $$;
revoke all on function public.pm_chat_group_leave(text) from public;
grant execute on function public.pm_chat_group_leave(text) to anon, authenticated;

-- آنلاین: فقط با RPC؛ هر کاربر فقط حضور خودش را ثبت می‌کند
create table if not exists public.chat_presence(
  name text primary key,
  seen_at timestamptz not null default now()
);
alter table public.chat_presence enable row level security;
revoke all on public.chat_presence from anon, authenticated;

create or replace function public.pm_presence(p_ping boolean default true) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me();
begin
  if me is null then return '[]'::jsonb; end if;
  if p_ping then
    insert into public.chat_presence(name, seen_at) values (me, now())
      on conflict (name) do update set seen_at = excluded.seen_at;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('n', name, 't', seen_at))
                     from public.chat_presence where seen_at > now() - interval '7 days'), '[]'::jsonb);
end $$;
revoke all on function public.pm_presence(boolean) from public;
grant execute on function public.pm_presence(boolean) to anon, authenticated;

create or replace function public.pm_chat_ver() returns integer language sql stable as $$ select 1 $$;
grant execute on function public.pm_chat_ver() to anon, authenticated;

notify pgrst, 'reload schema';
