-- =====================================================================
--  فضای سازمان (۳۷۷): هر شرکت طراحی، مشاور یا پیمانکار یک سازمان مستقل از پروژه
--  • «سازمان» و «عضو سازمان» در lists سراسری ('*')؛ «عضو سازمان» = سازمان¦شخص¦نقش¦ادمین(1/0)
--  • کارهای سازمان: tasks با co_space = نام سازمان و project_id '*'؛ فقط اعضای همان سازمان (و مدیر سامانه) می‌بینند و تغییر می‌دهند
--  • اعضا و ادمین‌ها را فقط ادمین همان سازمان یا مدیر سامانه تغییر می‌دهد؛ ساخت سازمان تازه: مدیر سامانه یا سرپرست همان تیم
--  پیش‌نیاز: company_space.sql و system_owner.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================
create or replace function public.pm_orgs() returns text[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(split_part(value, '¦', 1)), '{}')
    from public.lists where kind = 'عضو سازمان' and split_part(value, '¦', 2) = public.pm_me();
$$;
create or replace function public.pm_org_admin(o text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.pm_is_admin() or exists (select 1 from public.lists where kind = 'عضو سازمان'
     and split_part(value, '¦', 1) = o and split_part(value, '¦', 2) = public.pm_me() and split_part(value, '¦', 4) = '1');
$$;
-- سازمانی که هنوز عضوی ندارد را سرپرست همان تیم (در هر پروژه) می‌تواند راه بیندازد
create or replace function public.pm_org_boot(o text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select not exists (select 1 from public.lists where kind = 'عضو سازمان' and split_part(value, '¦', 1) = o)
     and exists (select 1 from public.lists where kind = 'مدیر شرکت' and value = public.pm_me() || '¦' || o);
$$;
revoke all on function public.pm_orgs() from public; grant execute on function public.pm_orgs() to anon, authenticated;
revoke all on function public.pm_org_admin(text) from public; grant execute on function public.pm_org_admin(text) to anon, authenticated;
revoke all on function public.pm_org_boot(text) from public; grant execute on function public.pm_org_boot(text) to anon, authenticated;

-- کارهای سازمان: عضو سازمان هم مثل عضو تیم همان پروژه
drop policy if exists "pm co space read" on public.tasks;
create policy "pm co space read" on public.tasks as restrictive for select
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()) or co_space = any((select public.pm_orgs())));
drop policy if exists "pm co space write" on public.tasks;
create policy "pm co space write" on public.tasks as restrictive for insert
  with check (co_space is null or co_space = (select public.pm_party()) or co_space = any((select public.pm_orgs())));
drop policy if exists "pm co space upd" on public.tasks;
create policy "pm co space upd" on public.tasks as restrictive for update
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()) or co_space = any((select public.pm_orgs())))
  with check (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()) or co_space = any((select public.pm_orgs())));
drop policy if exists "pm co space del" on public.tasks;
create policy "pm co space del" on public.tasks as restrictive for delete
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()) or co_space = any((select public.pm_orgs())));

-- سازمان و اعضایش
drop policy if exists "pm org read" on public.lists;
create policy "pm org read" on public.lists as restrictive for select
  using (kind not in ('سازمان', 'عضو سازمان') or (select public.pm_is_admin()) or split_part(value, '¦', 1) = any((select public.pm_orgs())) or split_part(value, '¦', 2) = (select public.pm_me()));
drop policy if exists "pm org ins" on public.lists;
create policy "pm org ins" on public.lists as restrictive for insert
  with check (kind not in ('سازمان', 'عضو سازمان') or public.pm_org_admin(split_part(value, '¦', 1)) or public.pm_org_boot(split_part(value, '¦', 1)));
drop policy if exists "pm org del" on public.lists;
create policy "pm org del" on public.lists as restrictive for delete
  using (kind not in ('سازمان', 'عضو سازمان') or public.pm_org_admin(split_part(value, '¦', 1)));

select count(*) as "سازمان‌ها" from public.lists where kind = 'سازمان';
