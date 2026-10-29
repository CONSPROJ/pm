-- =====================================================================
--  bundle3: همان bundle2، ولی فقط بخش‌هایی که عوض شده‌اند فرستاده می‌شود
--  (کاهش Egress). برنامه برای هر بخش (lists، statements، tasks، people…)
--  یک اثرانگشت (md5) نگه می‌دارد و می‌فرستد؛ بخشی که اثرانگشتش همان است
--  دوباره دانلود نمی‌شود و از نسخهٔ روی دستگاه خوانده می‌شود.
--  اسناد طراحی، جهت نامه‌ها و طبقهٔ فعالیت‌ها هم که قبلاً با درخواست‌های
--  جدا و کامل خوانده می‌شدند، در همین بسته می‌آیند.
--  پیش‌نیاز: تابع bundle2. یک بار در Supabase ← SQL Editor اجرا شود؛
--  اجرای دوباره بی‌خطر است. تا اجرا نشود، برنامه مثل قبل از bundle2 می‌خواند.
-- =====================================================================

create or replace function public.bundle3(p_date text default '', p_prev text default '', p_have jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare b jsonb; k text; v jsonb; h text; outj jsonb := '{}'::jsonb; hs jsonb := '{}'::jsonb;
begin
  b := public.bundle2(p_date, p_prev)::jsonb;
  begin
    b := b || jsonb_build_object('designs', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from public.designs d), '[]'::jsonb));
  exception when others then null; end;
  begin
    b := b || jsonb_build_object('letters_dir', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'direction', l.direction)) from public.letters l where l.direction is not null), '[]'::jsonb));
  exception when others then null; end;
  begin
    b := b || jsonb_build_object('tasks_floor', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'floor', t.floor)) from public.tasks t where t.floor is not null), '[]'::jsonb));
  exception when others then null; end;
  for k, v in select e.key, e.value from jsonb_each(b) e loop
    h := md5(v::text);
    hs := hs || jsonb_build_object(k, h);
    if coalesce(p_have ->> k, '') <> h then outj := outj || jsonb_build_object(k, v); end if;
  end loop;
  return outj || jsonb_build_object('__h', hs);
end $$;

grant execute on function public.bundle3(text, text, jsonb) to anon, authenticated;

-- دادهٔ روز (day_only) هم همین‌طور: بخشی که عوض نشده دوباره فرستاده نمی‌شود
create or replace function public.day3(p_date text default '', p_prev text default '', p_have jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare b jsonb; k text; v jsonb; h text; outj jsonb := '{}'::jsonb; hs jsonb := '{}'::jsonb;
begin
  b := public.day_only(p_date, p_prev)::jsonb;
  for k, v in select e.key, e.value from jsonb_each(b) e loop
    h := md5(v::text);
    hs := hs || jsonb_build_object(k, h);
    if coalesce(p_have ->> k, '') <> h then outj := outj || jsonb_build_object(k, v); end if;
  end loop;
  return outj || jsonb_build_object('__h', hs);
end $$;
grant execute on function public.day3(text, text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

select 'bundle3 آماده است؛ از این به بعد فقط بخش‌های تغییرکرده دانلود می‌شود ✓' as "نتیجه";
