-- گزارش کار کاربران برای همهٔ جدول‌ها (به‌جز پیام‌ها، خوانده‌شده‌ها، اشتراک اعلان و جدول‌های رمز)
do $$
declare t text;
begin
  if to_regprocedure('public._pm_audit()') is null then raise exception 'اول security_phase4.sql را اجرا کنید.'; end if;
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename not in ('audit_log', 'nudges', 'feed_reads', 'push_subs', 'people_auth', 'people_sessions')
            and tablename not like '\_%'
  loop
    execute format('drop trigger if exists pm_audit on public.%I', t);
    execute format('create trigger pm_audit after insert or update or delete on public.%I for each row execute function public._pm_audit()', t);
  end loop;
end $$;
select event_object_table as "جدول" from information_schema.triggers where trigger_name = 'pm_audit' group by 1 order by 1;
