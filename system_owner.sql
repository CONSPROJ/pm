-- =====================================================================
--  مالک سامانه و حذف مقدارهای ثابت (۳۷۰)
--  ۱) مدیران اصلی سامانه از فهرست «مدیر اصلی سامانه» (سراسری) خوانده می‌شوند، نه از نامی که در کد نوشته شده.
--     فقط خود مدیران اصلی این فهرست را تغییر می‌دهند و آخرین نفر برداشته نمی‌شود.
--  ۲) سمت افراد فقط از حسابشان: سمت‌های خالی یک بار از جدول قدیمی پر می‌شود (جدول از کد سایت حذف شد).
--  پیش‌نیاز: security_phase1.sql و project.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================

-- ۱) فهرست مدیران اصلی (یک بار با مدیر فعلی پر می‌شود)
insert into public.lists(kind, value, project_id)
select 'مدیر اصلی سامانه', 'آقای مهدی نعیمی', '*'
 where not exists (select 1 from public.lists where kind = 'مدیر اصلی سامانه');

create or replace function public.pm_is_root() returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.lists where kind = 'مدیر اصلی سامانه' and value = public.pm_me());
$$;
revoke all on function public.pm_is_root() from public;
grant execute on function public.pm_is_root() to anon, authenticated;

create or replace function public.pm_is_admin() returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare me text := public.pm_me(); lv integer;
begin
  if me is null then return false; end if;
  if public.pm_is_root() then return true; end if;
  select level into lv from public.people where name = me;
  return coalesce(lv, 0) = 1;
end $$;
revoke all on function public.pm_is_admin() from public;
grant execute on function public.pm_is_admin() to anon, authenticated;

drop policy if exists "pm root list ins" on public.lists;
create policy "pm root list ins" on public.lists as restrictive for insert
  with check (kind <> 'مدیر اصلی سامانه' or (select public.pm_is_root()));
drop policy if exists "pm root list upd" on public.lists;
create policy "pm root list upd" on public.lists as restrictive for update
  using (kind <> 'مدیر اصلی سامانه' or (select public.pm_is_root()));
drop policy if exists "pm root list del" on public.lists;
create policy "pm root list del" on public.lists as restrictive for delete
  using (kind <> 'مدیر اصلی سامانه' or (select public.pm_is_root()));

create or replace function public._pm_root_guard() returns trigger
language plpgsql
as $$
begin
  if old.kind = 'مدیر اصلی سامانه' and (select count(*) from public.lists where kind = 'مدیر اصلی سامانه') <= 1 then
    raise exception 'دست‌کم یک مدیر اصلی سامانه لازم است.';
  end if;
  return old;
end $$;
drop trigger if exists pm_root_guard on public.lists;
create trigger pm_root_guard before delete on public.lists for each row execute function public._pm_root_guard();

-- پیش‌فرض همهٔ پروژه‌ها (ردیف sys «قوانین سامانه»، سراسری) را فقط مدیر اصلی تغییر می‌دهد
drop policy if exists "pm sys rules ins" on public.lists;
create policy "pm sys rules ins" on public.lists as restrictive for insert
  with check (not (kind = 'قوانین سامانه' and value like 'sys¦%') or (select public.pm_is_root()));
drop policy if exists "pm sys rules del" on public.lists;
create policy "pm sys rules del" on public.lists as restrictive for delete
  using (not (kind = 'قوانین سامانه' and value like 'sys¦%') or (select public.pm_is_root()));

-- ۲) سمت‌های خالی از جدول قدیمی
update public.people p set role = m.role
  from (values
    ('آقای حیدرنیا', 'مدیریت پروژه'),
    ('آقای خان احمدی', 'سرپرست کارگاه'),
    ('آقای علی خداپناهی', 'سرپرست مشاعات'),
    ('آقای خداپناهی', 'سرپرست مشاعات'),
    ('آقای مهدی اسلامی', 'مهندس اجرا'),
    ('آقای سامین خواجه‌زاده', 'مهندس اجرا'),
    ('آقای عرفان حیدری', 'مهندس اجرا'),
    ('آقای پارسا محمودی', 'مهندس اجرا'),
    ('آقای امیر ابراهیمی', 'امور قراردادی'),
    ('آقای مهدی نعیمی', 'کنترل پروژه'),
    ('خانم سپیده کریمیان', 'دفتر فنی پروژه')
  ) as m(name, role)
 where p.name = m.name and coalesce(btrim(p.role), '') = '';

select value as "مدیر اصلی سامانه" from public.lists where kind = 'مدیر اصلی سامانه';
