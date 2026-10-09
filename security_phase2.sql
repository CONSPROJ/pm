-- =====================================================================
--  امنیت — مرحلهٔ ۲: بستن جدول‌ها
--
--  فقط بعد از اینکه مرحلهٔ ۱ اجرا شد و در سایت (مدیریت کاربران ← امنیت و
--  پشتیبان ← «بررسی وضعیت») نوشت «نشست امن کار می‌کند ✓».
--  قبل از اجرا، از همان صفحه «دانلود پشتیبان کامل» را بزنید.
--  اگر هر مشکلی پیش آمد: security_phase2_rollback.sql را اجرا کنید.
--
--  بعد از این مرحله:
--    • بدون ورود، هیچ داده‌ای از سایت خوانده یا نوشته نمی‌شود (جز فهرست
--      نام کاربران برای صفحهٔ ورود و درخواست ساخت حساب).
--    • پیام خصوصی را فقط فرستنده و گیرنده می‌بینند؛ حتی با دستکاری
--      مرورگر هم پیام کس دیگری از سرور بیرون نمی‌آید. پیام به نام کس
--      دیگری هم نمی‌شود فرستاد.
--    • دسترسی‌ها، زنجیرهٔ تأیید و محل آپلود را فقط ادمین تغییر می‌دهد.
--    • سطح، فعال بودن و نام هر کاربر را فقط ادمین عوض می‌کند.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_me()') is null then
    raise exception 'اول security_phase1.sql را اجرا کنید.';
  end if;
end $$;

-- پاک کردن همهٔ policyهای قبلی یک جدول (policyها با هم «یا» می‌شوند؛
-- یک policy باز قدیمی کافی بود تا قفل تازه بی‌اثر شود)
create or replace function public._pm_drop_policies(t text) returns void
language plpgsql as $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
    execute format('drop policy %I on public.%I', p.policyname, t);
  end loop;
end $$;
revoke all on function public._pm_drop_policies(text) from public, anon, authenticated;

-- ۱) همهٔ جدول‌های داده: فقط کاربر واردشده
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename not in ('people', 'people_auth', 'people_sessions', 'nudges', 'lists')
  loop
    execute format('alter table public.%I enable row level security', t);
    perform public._pm_drop_policies(t);
    execute format('create policy "pm logged in" on public.%I for all '
      || 'using ((select public.pm_me()) is not null) with check ((select public.pm_me()) is not null)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- ۲) فهرست‌های پایه: خواندن برای کاربران واردشده؛ تنظیمات حساس فقط ادمین
alter table public.lists enable row level security;
select public._pm_drop_policies('lists');
create policy "pm logged in" on public.lists for select using ((select public.pm_me()) is not null);
create policy "pm lists write" on public.lists for insert
  with check ((select public.pm_me()) is not null and (
    kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
    or (select public.pm_is_admin())));
create policy "pm lists update" on public.lists for update
  using ((select public.pm_me()) is not null and (
    kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
    or (select public.pm_is_admin())))
  with check ((select public.pm_me()) is not null and (
    kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
    or (select public.pm_is_admin())));
create policy "pm lists delete" on public.lists for delete
  using ((select public.pm_me()) is not null and (
    kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی')
    or (select public.pm_is_admin())));
grant select, insert, update, delete on public.lists to anon, authenticated;

-- ۳) پیام‌ها، تلنگرها و نظرها
--    «پیام» خصوصی است: فقط فرستنده و گیرنده. فرستنده همیشه خودِ کاربر.
alter table public.nudges enable row level security;
select public._pm_drop_policies('nudges');
create policy "pm logged in" on public.nudges for select
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or to_name = (select public.pm_me())));
create policy "pm nudges insert" on public.nudges for insert
  with check ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me())));
create policy "pm nudges update" on public.nudges for update
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or to_name = (select public.pm_me())))
  with check ((select public.pm_me()) is not null);
create policy "pm nudges delete" on public.nudges for delete
  using ((select public.pm_me()) is not null and
         (kind is distinct from 'پیام' or from_name = (select public.pm_me()) or to_name = (select public.pm_me())));
grant select, insert, update, delete on public.nudges to anon, authenticated;

-- ۴) کاربران: فهرست نام‌ها برای صفحهٔ ورود باز است (هیچ رمزی در این جدول نیست)
alter table public.people enable row level security;
select public._pm_drop_policies('people');
create policy "pm people read" on public.people for select using (true);
create policy "pm people insert" on public.people for insert
  with check ((select public.pm_is_admin())
              or name = (select public.pm_me())                       -- به‌روزرسانی ردیف خود (upsert)
              or (pending is true and active is false));              -- درخواست ساخت حساب
create policy "pm logged in" on public.people for update
  using ((select public.pm_is_admin()) or name = (select public.pm_me()))
  with check ((select public.pm_is_admin()) or name = (select public.pm_me()));
create policy "pm people delete" on public.people for delete using ((select public.pm_is_admin()));
grant select, insert, update, delete on public.people to anon, authenticated;

-- غیرادمین نمی‌تواند سطح، فعال بودن، تأیید یا نام را عوض کند
create or replace function public._pm_people_guard() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.pm_is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.level := null; new.active := false; new.pending := true;
    return new;
  end if;
  new.name := old.name; new.level := old.level; new.active := old.active; new.pending := old.pending;
  return new;
end $$;
drop trigger if exists pm_people_guard on public.people;
create trigger pm_people_guard before insert or update on public.people
  for each row execute function public._pm_people_guard();

-- ۵) تابع‌های بارگذاری داده با دسترسی خودِ کاربر اجرا شوند، نه با دسترسی کامل
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('bundle2', 'day_only') and p.prosecdef
  loop
    execute format('alter function %s security invoker', f.sig);
  end loop;
end $$;

-- بررسی: باید فهرست جدول‌ها با policy «pm ...» بیاید
select tablename as "جدول", string_agg(policyname, '، ') as "قانون‌ها"
  from pg_policies where schemaname = 'public' group by tablename order by 1;
