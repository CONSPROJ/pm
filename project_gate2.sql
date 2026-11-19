-- ۵۲۰: حسابی که در پروژهٔ دیگری عضو یا دعوت‌شده است و در پروژهٔ اصلی نه سمت دارد نه عضویت، پروژهٔ اصلی را نمی‌بیند (بی‌نیاز به علامت دستی)
create or replace function public.pm_project() returns text
language plpgsql stable security definer
set search_path = public
as $$
declare p text; me text;
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
    if exists (select 1 from public.lists where kind = 'حساب پروژه‌ای' and value = me) then return null; end if;
    if exists (select 1 from public.lists where kind = 'عضو پروژه' and split_part(value, '¦', 1) <> 'p1'
                 and split_part(value, '¦', 2) = me and split_part(value, '¦', 5) in ('فعال', 'دعوت'))
       and not exists (select 1 from public.lists where kind = 'عضو پروژه' and split_part(value, '¦', 1) = 'p1'
                 and split_part(value, '¦', 2) = me and split_part(value, '¦', 5) = 'فعال')
       and not exists (select 1 from public.people where name = me and coalesce(btrim(role), '') <> '') then
      return null;
    end if;
    return 'p1';
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
