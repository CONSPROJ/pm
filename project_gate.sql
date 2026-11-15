-- =====================================================================
--  راه ورود به پروژه‌ها (۳۶۴)
--  حسابی که فقط برای پروژهٔ دیگری دعوت/ساخته شده (مثلاً طراح بیرونی) و در پروژهٔ اصلی (p1) سمتی ندارد،
--  دیگر دادهٔ پروژهٔ اصلی را نمی‌بیند. حساب‌های قدیمی (بی‌عضویت در پروژهٔ دیگر) و هر کس که در پروژهٔ اصلی سمت دارد مثل قبل‌اند.
--  یک نفر می‌تواند در یک پروژه مدیر و در پروژهٔ دیگر طراح باشد؛ سمت و تیم هر پروژه جداست.
--  پیش‌نیاز: project.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================
create or replace function public.pm_project() returns text
language plpgsql stable security definer
set search_path = public
as $$
declare p text; me text; rl text;
begin
  begin
    p := nullif(current_setting('request.headers', true)::json->>'x-pm-project', '');
  exception when others then p := null;
  end;
  if p is null then p := 'p1'; end if;
  if p <> 'p1' and p !~ '^[a-z0-9]{2,24}$' then return null; end if;
  me := public.pm_me();
  if p = 'p1' then
    if me is null or public.pm_is_admin() then return 'p1'; end if;
    if not exists (select 1 from public.lists
                    where kind = 'عضو پروژه'
                      and split_part(value, '¦', 1) <> 'p1'
                      and split_part(value, '¦', 2) = me
                      and split_part(value, '¦', 5) <> 'رد') then
      return 'p1';
    end if;
    select btrim(coalesce(role, '')) into rl from public.people where name = me limit 1;
    if coalesce(rl, '') not in ('', '—') then return 'p1'; end if;
    return null;
  end if;
  if me is null then return null; end if;
  if public.pm_is_admin() then return p; end if;
  if exists (select 1 from public.lists
              where kind = 'عضو پروژه'
                and split_part(value, '¦', 1) = p
                and split_part(value, '¦', 2) = me
                and split_part(value, '¦', 5) = 'فعال') then
    return p;
  end if;
  return null;
end $$;
revoke all on function public.pm_project() from public;
grant execute on function public.pm_project() to anon, authenticated;

-- بررسی: نام حساب‌هایی که دیگر پروژهٔ اصلی را نمی‌بینند
select distinct split_part(l.value, '¦', 2) as "فقط پروژه‌های دیگر"
  from public.lists l
 where l.kind = 'عضو پروژه' and split_part(l.value, '¦', 1) <> 'p1' and split_part(l.value, '¦', 5) <> 'رد'
   and not exists (select 1 from public.people p where p.name = split_part(l.value, '¦', 2) and btrim(coalesce(p.role, '')) not in ('', '—'));
