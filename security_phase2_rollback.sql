-- =====================================================================
--  بازگشت مرحلهٔ ۲ امنیت (فقط اگر بعد از اجرای security_phase2.sql بخشی
--  از سایت کار نکرد). جدول‌ها را به حالت باز قبلی برمی‌گرداند؛ مرحلهٔ ۱
--  (نشست‌ها و قفل تابع‌های رمز) سر جایش می‌ماند.
--  بعد از اجرا، خطای دیده‌شده را خبر دهید تا قانون همان بخش اصلاح شود.
-- =====================================================================
drop trigger if exists pm_people_guard on public.people;

do $$
declare t text; p record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
            and tablename not in ('people_auth', 'people_sessions')
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "open all" on public.%I for all using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
