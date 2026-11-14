create or replace function public._pm_pj_global() returns trigger
language plpgsql
as $$
declare k text := '';
begin
  if tg_table_name in ('lists', 'nudges') then
    k := coalesce(to_jsonb(new)->>'kind', '');
  end if;
  if tg_table_name = 'lists' and k in ('دسترسی سطح','دسترسی نقش','دسترسی فرد','پروژه','عضو پروژه','دوره همکاری','کاور پروفایل','مرخصی','نام مستعار','امنیت سامانه','تنظیم آپلود','رشتهٔ افراد','نمای پیش‌فرض') then
    new.project_id := '*';
  elsif tg_table_name = 'nudges' and k in ('دعوت پروژه','پذیرش دعوت','کاور پروفایل','امنیت سامانه') then
    new.project_id := '*';
  elsif new.project_id is null or new.project_id = '' or new.project_id = '-' or new.project_id = '*' then
    new.project_id := coalesce(public.pm_project(), '-');
  end if;
  return new;
end $$;

update public.nudges set project_id = 'p1' where project_id = '*' and kind in ('پیام', 'واکنش');
update public.lists set project_id = 'p1' where project_id = '*' and kind = 'زنجیرهٔ تأیید داخلی';

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('bundle', 'bundle2', 'bundle3', 'day_only', 'day3') and p.prosecdef
  loop
    execute format('alter function %s security invoker', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
