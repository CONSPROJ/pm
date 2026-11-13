-- =====================================================================
--  دسترسی سند به سند در خود سرور (RLS)
--  همان منطق سایت: هر نوع سند (صورت وضعیت، قرارداد، نامه، صورتجلسه، اسناد طراحی) اجازهٔ خودش را دارد؛
--  اجازه از «پنل دسترسی‌ها»ی سایت خوانده می‌شود (lists: دسترسی سطح / دسترسی نقش / دسترسی فرد)،
--  وگرنه پیش‌فرض‌های همین فایل. ادمین (و کاربر صفر) همه را می‌بیند.
--  اسناد طراحی برای کسی که «همهٔ رشته‌ها» ندارد فقط رشته‌هایی که در سمتش آمده.
--  پیش‌نیاز: security_phase1/2 (pm_me، pm_is_admin). اجرای دوباره بی‌خطر است.
-- =====================================================================

create or replace function public.pm_can(k text, def_lv int[], def_roles text[])
returns boolean language plpgsql stable security definer set search_path = public as $$
declare me text := public.pm_me(); lv int; rl text; v text; roles text[]; lvs int[];
begin
  if me is null then return false; end if;
  if public.pm_is_admin() then return true; end if;
  -- اجازهٔ فرد (روشن یا خاموش) بر همه مقدم است
  select value into v from public.lists where kind = 'دسترسی فرد' and value like me || '¦' || k || '=%' limit 1;
  if v is not null then return right(v, 1) = '1'; end if;
  select level, coalesce(role, '') into lv, rl from public.people where name = me;
  if lv = 1 then return true; end if;
  -- سمت (از چارت سازمانی)
  select string_to_array(split_part(value, '=', 2), '|') into roles from public.lists where kind = 'دسترسی نقش' and value like k || '=%' limit 1;
  roles := coalesce(roles, def_roles);
  if rl <> '' and exists (select 1 from unnest(roles) r where trim(r) <> '' and position(trim(r) in rl) > 0) then return true; end if;
  -- سطح
  select array(select nullif(trim(x), '')::int from unnest(string_to_array(split_part(value, '=', 2), ',')) x where trim(x) ~ '^-?\d+$') into lvs
    from public.lists where kind = 'دسترسی سطح' and value like k || '=%' limit 1;
  lvs := coalesce(lvs, def_lv);
  return lv = any(lvs);
end $$;
revoke all on function public.pm_can(text, int[], text[]) from public;
grant execute on function public.pm_can(text, int[], text[]) to anon, authenticated;

-- رشتهٔ سند طراحی در سمت فرد آمده؟ (معماری، سازه، مکانیک، برق و هر نام رشتهٔ دیگر)
create or replace function public.pm_disc_ok(disc text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare me text := public.pm_me(); rl text; d text;
begin
  if coalesce(trim(disc), '') = '' then return true; end if;
  select coalesce(role, '') into rl from public.people where name = me;
  for d in select trim(x) from unnest(regexp_split_to_array(disc, '\s*[،,]\s*')) x loop
    if d = '' then continue; end if;
    if position(d in rl) > 0 then return true; end if;
    if d like '%معمار%' and rl like '%معمار%' then return true; end if;
    if d like '%سازه%' and rl like '%سازه%' then return true; end if;
    if d like '%مکانیک%' and rl like '%مکانیک%' then return true; end if;
    if d like '%برق%' and rl like '%برق%' then return true; end if;
  end loop;
  return false;
end $$;
revoke all on function public.pm_disc_ok(text) from public;
grant execute on function public.pm_disc_ok(text) to anon, authenticated;

do $$
declare t text; k text; lv int[]; ro text[];
begin
  for t, k, lv, ro in values
    ('statements', 'doc.statement', array[1,2], array['مدیریت پروژه','مدیر پروژه','دفتر فنی','کنترل پروژه']),
    ('contracts',  'doc.contract',  array[1,2], array['مدیریت پروژه','مدیر پروژه','دفتر فنی','کنترل پروژه']),
    ('letters',    'doc.letter',    array[1,2,3], array[]::text[]),
    ('minutes',    'doc.minute',    array[1,2,3,5], array[]::text[])
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    perform public._pm_drop_policies(t);
    execute format('create policy "pm doc" on public.%I for all using (public.pm_can(%L, %L::int[], %L::text[])) with check (public.pm_can(%L, %L::int[], %L::text[]))', t, k, lv, ro, k, lv, ro);
  end loop;
  if to_regclass('public.designs') is not null then
    alter table public.designs enable row level security;
    perform public._pm_drop_policies('designs');
    create policy "pm doc" on public.designs for all
      using (public.pm_can('doc.design', array[1,2,3], array['طراح','مشاور','هماهنگی طراحی','دفتر فنی'])
             and (public.pm_can('doc.design.all', array[1,2,3], array['مدیریت پروژه','مدیر پروژه','دفتر فنی','کنترل پروژه','هماهنگی طراحی']) or public.pm_disc_ok(discipline)))
      with check (public.pm_can('doc.design', array[1,2,3], array['طراح','مشاور','هماهنگی طراحی','دفتر فنی']));
  end if;
end $$;


-- تنظیمات سراسری (قوانین، بخش‌های فعال، نسخهٔ سایت) هم مثل دسترسی‌ها فقط با ادمین نوشته می‌شوند
drop policy if exists "pm lists write" on public.lists;
drop policy if exists "pm lists update" on public.lists;
drop policy if exists "pm lists delete" on public.lists;
create policy "pm lists write" on public.lists for insert
  with check ((select public.pm_me()) is not null and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی', 'قوانین سامانه', 'ماژول‌های پروژه', 'نسخهٔ سایت', 'حالت نگهداری') or (select public.pm_is_admin())));
create policy "pm lists update" on public.lists for update
  using ((select public.pm_me()) is not null and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی', 'قوانین سامانه', 'ماژول‌های پروژه', 'نسخهٔ سایت', 'حالت نگهداری') or (select public.pm_is_admin())))
  with check ((select public.pm_me()) is not null and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی', 'قوانین سامانه', 'ماژول‌های پروژه', 'نسخهٔ سایت', 'حالت نگهداری') or (select public.pm_is_admin())));
create policy "pm lists delete" on public.lists for delete
  using ((select public.pm_me()) is not null and (kind not in ('دسترسی سطح', 'دسترسی فرد', 'دسترسی نقش', 'تنظیم آپلود', 'زنجیرهٔ تأیید داخلی', 'قوانین سامانه', 'ماژول‌های پروژه', 'نسخهٔ سایت', 'حالت نگهداری') or (select public.pm_is_admin())));

-- تابع‌های بسته (bundle2/bundle3/day_only) با دسترسی خود کاربر اجرا شوند تا همین قانون‌ها در آن‌ها هم اعمال شود
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('bundle2', 'bundle3', 'day_only', 'day3') and p.prosecdef
  loop execute format('alter function %s security invoker', f.sig); end loop;
end $$;
notify pgrst, 'reload schema';

select tablename as "جدول", string_agg(policyname, '، ') as "قانون"
  from pg_policies where schemaname = 'public' and tablename in ('statements','contracts','letters','minutes','designs') group by 1 order by 1;
