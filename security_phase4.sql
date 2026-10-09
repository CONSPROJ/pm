-- =====================================================================
--  امنیت — مرحلهٔ ۴: نقش‌ها روی سرور + سابقهٔ کامل تغییرات
--  پیش‌نیاز: مرحلهٔ ۱ و ۲. اجرای دوباره بی‌خطر است.
--
--  • «فقط مشاهده» (۴) و «بیرونی» (۶) روی سرور هم هیچ داده‌ای را ثبت،
--    ویرایش یا حذف نمی‌کنند (جز پیام، نظر، یادآور و درخواست مرخصی).
--  • «بیرونی» صورت وضعیت، قرارداد، نامه و بخش کارگری را اصلاً نمی‌بیند.
--  • هر افزودن، ویرایش و حذف در جدول‌های اصلی با نام انجام‌دهنده و
--    مقدار قبل/بعد در «سابقهٔ تغییرات» ثبت می‌شود؛ فقط ادمین می‌بیند و
--    هیچ‌کس (حتی ادمین از سایت) نمی‌تواند پاکش کند. متن پیام‌های خصوصی
--    و رمزها در آن نمی‌آید.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_me()') is null then raise exception 'اول مرحلهٔ ۱ را اجرا کنید.'; end if;
end $$;

-- ۱) نقش کاربر جاری روی سرور
create or replace function public.pm_level() returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare me text := public.pm_me(); lv integer;
begin
  if me is null then return null; end if;
  if public.pm_is_admin() then return 1; end if;
  select level into lv from public.people where name = me;
  return coalesce(lv, 3);
end $$;
grant execute on function public.pm_level() to anon, authenticated;

-- ۲) قانون جدول‌های داده: خواندن برای واردشده‌ها (بیرونی: نه مالی و کارگری)،
--    نوشتن فقط برای نقش‌هایی که اجازهٔ ویرایش دارند
do $$
declare t text; secret boolean;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename not in ('people', 'people_auth', 'people_sessions', 'nudges', 'lists', 'feed_reads', 'audit_log')
  loop
    secret := t in ('statements', 'contracts', 'letters', 'workers', 'worker_daily', 'worker_ot', 'worker_changes', 'material_move');
    execute format('alter table public.%I enable row level security', t);
    perform public._pm_drop_policies(t);
    execute format('create policy "pm logged in" on public.%I for select using ((select public.pm_level()) is not null %s)',
      t, case when secret then 'and (select public.pm_level()) <> 6' else '' end);
    execute format('create policy "pm write" on public.%I for insert with check ((select public.pm_level()) not in (4, 6))', t);
    execute format('create policy "pm update" on public.%I for update using ((select public.pm_level()) not in (4, 6)) with check ((select public.pm_level()) not in (4, 6))', t);
    execute format('create policy "pm delete" on public.%I for delete using ((select public.pm_level()) not in (4, 6))', t);
  end loop;
end $$;

-- خوانده‌شده‌ها: هر کاربر واردشده (فقط نشانهٔ دیده‌شدن است)
do $$ begin
  if to_regclass('public.feed_reads') is not null then
    alter table public.feed_reads enable row level security;
    perform public._pm_drop_policies('feed_reads');
    create policy "pm logged in" on public.feed_reads for all
      using ((select public.pm_me()) is not null) with check ((select public.pm_me()) is not null);
  end if;
end $$;

-- ۳) فهرست‌های پایه: فقط‌مشاهده و بیرونی فقط درخواست مرخصی ثبت می‌کنند
drop policy if exists "pm lists write" on public.lists;
drop policy if exists "pm lists update" on public.lists;
drop policy if exists "pm lists delete" on public.lists;
create policy "pm lists write" on public.lists for insert
  with check ((select public.pm_me()) is not null
    and ((select public.pm_level()) not in (4, 6) or kind = 'مرخصی')
    and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
         or (select public.pm_is_admin())));
create policy "pm lists update" on public.lists for update
  using ((select public.pm_me()) is not null
    and ((select public.pm_level()) not in (4, 6) or kind = 'مرخصی')
    and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
         or (select public.pm_is_admin())))
  with check ((select public.pm_me()) is not null);
create policy "pm lists delete" on public.lists for delete
  using ((select public.pm_me()) is not null
    and ((select public.pm_level()) not in (4, 6) or kind = 'مرخصی')
    and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
         or (select public.pm_is_admin())));

-- ۴) سابقهٔ تغییرات (فقط افزوده می‌شود؛ ویرایش و حذفش از سایت ممکن نیست)
create table if not exists public.audit_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  who     text,
  tbl     text not null,
  op      text not null,
  row_id  text,
  data    jsonb
);
create index if not exists audit_log_at on public.audit_log(at desc);
alter table public.audit_log enable row level security;
select public._pm_drop_policies('audit_log');
create policy "pm audit read" on public.audit_log for select using ((select public.pm_is_admin()));
revoke insert, update, delete on public.audit_log from anon, authenticated;
grant select on public.audit_log to anon, authenticated;

create or replace function public._pm_audit() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare o jsonb; n jsonb; d jsonb := '{}'::jsonb; k text; rid text;
begin
  if tg_op = 'DELETE' then
    o := to_jsonb(old); d := o;
  elsif tg_op = 'INSERT' then
    n := to_jsonb(new); d := n;
  else
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if (o -> k) is distinct from (n -> k) and k not in ('updated_at') then
        d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
  end if;
  rid := coalesce(coalesce(n, o) ->> 'id', coalesce(n, o) ->> 'name', coalesce(n, o) ->> 'kind');
  d := d - 'password_hash' - 'pw_bcrypt' - 'pass_hash';
  insert into public.audit_log(who, tbl, op, row_id, data)
  values (public.pm_me(), tg_table_name, tg_op, rid, d);
  if random() < 0.002 then delete from public.audit_log where at < now() - interval '400 days'; end if;
  return null;
end $$;
revoke all on function public._pm_audit() from public, anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename in ('activities', 'issues', 'machines', 'material_move', 'statements', 'contracts', 'minutes',
                              'letters', 'designs', 'tasks', 'workers', 'worker_daily', 'worker_ot', 'worker_changes',
                              'people', 'lists')
  loop
    execute format('drop trigger if exists pm_audit on public.%I', t);
    execute format('create trigger pm_audit after insert or update or delete on public.%I for each row execute function public._pm_audit()', t);
  end loop;
end $$;

-- بررسی
select tablename as "جدول", string_agg(policyname, '، ') as "قانون‌ها"
  from pg_policies where schemaname = 'public' group by tablename order by 1;
