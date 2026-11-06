-- =====================================================================
--  مقیاس‌پذیری — ایندکس‌ها، نگهبان تأیید روی سرور، سرجمع پورتفولیو
--  پیش‌نیاز: مرحله‌های امنیت ۱ تا ۴ و project.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_level()') is null then raise exception 'اول مرحلهٔ ۴ امنیت را اجرا کنید.'; end if;
end $$;

-- ۱) ایندکس‌ها (فقط اگر جدول و ستون وجود دارد)
create or replace function public._pm_ix(t text, cols text, nm text) returns void
language plpgsql as $$
declare c text;
begin
  if to_regclass('public.' || t) is null then return; end if;
  foreach c in array string_to_array(replace(replace(cols, ' desc', ''), ' ', ''), ',') loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = c) then return; end if;
  end loop;
  execute format('create index if not exists %I on public.%I (%s)', nm, t, cols);
end $$;

do $$ begin
  perform public._pm_ix('lists', 'project_id, kind', 'lists_pj_kind_idx');
  perform public._pm_ix('lists', 'kind', 'lists_kind_idx');
  perform public._pm_ix('nudges', 'project_id, kind, created_at desc', 'nudges_pj_kind_at_idx');
  perform public._pm_ix('nudges', 'to_name, created_at desc', 'nudges_to_at_idx');
  perform public._pm_ix('nudges', 'item_id', 'nudges_item_idx');
  perform public._pm_ix('activities', 'project_id, date_fa', 'activities_pj_date_idx');
  perform public._pm_ix('activities', 'contractor', 'activities_ctr_idx');
  perform public._pm_ix('activities', 'engineer', 'activities_eng_idx');
  perform public._pm_ix('activities', 'skill', 'activities_skill_idx');
  perform public._pm_ix('activities', 'zone', 'activities_zone_idx');
  perform public._pm_ix('issues', 'project_id, date_fa', 'issues_pj_date_idx');
  perform public._pm_ix('issues', 'zone', 'issues_zone_idx');
  perform public._pm_ix('worker_daily', 'project_id, date_fa', 'worker_daily_pj_date_idx');
  perform public._pm_ix('worker_daily', 'worker_code', 'worker_daily_code_idx');
  perform public._pm_ix('worker_ot', 'project_id, date_fa', 'worker_ot_pj_date_idx');
  perform public._pm_ix('tasks', 'project_id, category', 'tasks_pj_cat_idx');
  perform public._pm_ix('tasks', 'floor', 'tasks_floor_idx');
  perform public._pm_ix('people', 'name', 'people_name_idx');
  perform public._pm_ix('audit_log', 'tbl, row_id', 'audit_tbl_row_idx');
  perform public._pm_ix('audit_log', 'at desc', 'audit_at_idx');
end $$;

-- بخش JSON ردیف «شناسه¦JSON» (اگر JSON نبود: null)
create or replace function public._pm_js(v text) returns jsonb
language plpgsql immutable as $$
declare i integer := position('¦' in coalesce(v, ''));
begin
  if i < 2 then return null; end if;
  return substr(v, i + 1)::jsonb;
exception when others then return null;
end $$;

-- ۲) اجازه روی سرور، هم‌سان با «can» در برنامه: ادمین ← استثنای فردی ← سمت ← سطح (یا پیش‌فرض)
create or replace function public.pm_can(p_cap text, p_def integer[]) returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare me text := public.pm_me(); lv integer; ov text; rl text; lvs integer[]; raw text;
begin
  if me is null then return false; end if;
  if public.pm_is_admin() then return true; end if;
  lv := public.pm_level();
  if lv = 1 then return true; end if;
  select split_part(split_part(value, '¦', 2), '=', 2) into ov from public.lists
   where kind = 'دسترسی فرد' and lower(btrim(split_part(value, '¦', 1))) = lower(btrim(me))
     and split_part(split_part(value, '¦', 2), '=', 1) = p_cap limit 1;
  if ov is not null then return ov = '1'; end if;
  select coalesce(to_jsonb(x)->>'role', '') into rl from public.people x where x.name = me limit 1;
  if coalesce(rl, '') <> '' and exists (
      select 1 from public.lists l, unnest(string_to_array(substr(l.value, length(p_cap) + 2), '|')) r
       where l.kind = 'دسترسی نقش' and l.value like p_cap || '=%' and btrim(r) <> '' and position(btrim(r) in rl) > 0) then
    return true;
  end if;
  select substr(value, length(p_cap) + 2) into raw from public.lists where kind = 'دسترسی سطح' and value like p_cap || '=%' limit 1;
  if raw is not null then
    select coalesce(array_agg(x::integer), '{}') into lvs from unnest(string_to_array(raw, ',')) x where x ~ '^-?[0-9]$';
  else lvs := p_def; end if;
  if lv = any(lvs) then return true; end if;
  if -lv = any(lvs) then return false; end if;
  -- سطوح تازه: مدیر بخش از کارشناس، پیمانکار و مالک از مهمان پیروی می‌کنند
  if lv = 7 and (3 = any(lvs)) then return true; end if;
  if lv in (8, 9) and (6 = any(lvs)) then return true; end if;
  return false;
end $$;
revoke all on function public.pm_can(text, integer[]) from public;
grant execute on function public.pm_can(text, integer[]) to anon, authenticated;

-- ۳) نگهبان تأیید: تغییر وضعیت به مرحلهٔ تأیید فقط با اجازهٔ همان مرحله.
--    وضعیت قبلی هر رکورد روی سرور نگه داشته می‌شود (برنامه هر ذخیره را حذف و دوباره ثبت می‌کند).
create table if not exists public.pm_reg_state (
  project_id text not null default '-',
  kind       text not null,
  id         text not null,
  st         text,
  by_name    text,
  at         timestamptz not null default now(),
  primary key (project_id, kind, id)
);
alter table public.pm_reg_state enable row level security;
revoke all on public.pm_reg_state from anon, authenticated;

create or replace function public._pm_reg_ok(k text, st text) returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare qc boolean;
begin
  if public.pm_is_admin() then return true; end if;
  qc := public.pm_can('qc.inspect', array[1,2]) or public.pm_can('qc.request', array[1,2,3,5]) or public.pm_can('write.hse', array[1,2,3])
        or coalesce((select to_jsonb(x)->>'role' from public.people x where x.name = public.pm_me() limit 1), '') ~* '(کیفیت|QC|ناظر)';
  return case
    when k = 'مجوز کار' and st in ('ok', 'no') then public.pm_can('write.hse', array[1,2,3])
    when k = 'کنترل ورود مصالح' and st in ('acc', 'cond', 'rej') then qc
    when k = 'ارسال مدارک فنی' and st in ('A', 'B', 'C') then qc
    when k = 'بازرسی و آزمون' and st in ('pass', 'fail') then qc
    when k = 'تأخیر و آب‌وهوا' and st in ('ok', 'no') then false
    when k in ('کد هزینه', 'ارزیابی تأمین‌کننده') then false
    else true end;
end $$;
revoke all on function public._pm_reg_ok(text, text) from public;

create or replace function public._pm_reg_guard() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare rid text; js jsonb; st text; prev text; pj text := coalesce(new.project_id, '-'); i integer;
begin
  if new.kind not in ('مجوز کار', 'کنترل ورود مصالح', 'ارسال مدارک فنی', 'بازرسی و آزمون', 'تأخیر و آب‌وهوا', 'کد هزینه', 'ارزیابی تأمین‌کننده') then return new; end if;
  i := position('¦' in new.value);
  if i < 2 then return new; end if;
  rid := substr(new.value, 1, i - 1);
  js := public._pm_js(new.value); if js is null then return new; end if;
  st := coalesce(js->>'st', '');
  select s.st into prev from public.pm_reg_state s where s.project_id = pj and s.kind = new.kind and s.id = rid;
  if new.kind in ('کد هزینه', 'ارزیابی تأمین‌کننده') then
    if not public._pm_reg_ok(new.kind, st) then raise exception 'فقط مدیر سامانه می‌تواند این بخش را ثبت یا ویرایش کند.' using errcode = '42501'; end if;
  elsif prev is distinct from st and not public._pm_reg_ok(new.kind, st) then
    raise exception 'اجازهٔ این تأیید را ندارید.' using errcode = '42501';
  end if;
  insert into public.pm_reg_state (project_id, kind, id, st, by_name, at) values (pj, new.kind, rid, st, public.pm_me(), now())
    on conflict (project_id, kind, id) do update set st = excluded.st, by_name = excluded.by_name, at = now()
    where public.pm_reg_state.st is distinct from excluded.st;
  return new;
end $$;

drop trigger if exists zz_pm_reg_guard on public.lists;
create trigger zz_pm_reg_guard before insert or update on public.lists
  for each row execute function public._pm_reg_guard();

-- وضعیت فعلی رکوردهای موجود (تا ذخیرهٔ دوبارهٔ آن‌ها گیر نکند)
insert into public.pm_reg_state (project_id, kind, id, st)
select coalesce(project_id, '-'), kind, split_part(value, '¦', 1),
       public._pm_js(value)->>'st'
  from public.lists
 where kind in ('مجوز کار', 'کنترل ورود مصالح', 'ارسال مدارک فنی', 'بازرسی و آزمون', 'تأخیر و آب‌وهوا', 'کد هزینه', 'ارزیابی تأمین‌کننده')
   and position('¦' in value) > 1
on conflict (project_id, kind, id) do nothing;

-- ۴) سرجمع پورتفولیو روی سرور (فقط ادمین): یک درخواست به‌جای بار کردن همهٔ داده‌ها
create or replace function public.pm_portfolio() returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb := '[]'::jsonb; p record; n jsonb; t text; c bigint;
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  for p in
    select 'p1'::text as id, coalesce((select public._pm_js(value)->>'name' from public.lists where kind = 'پروژه' and value like 'p1¦%' limit 1), 'پروژهٔ اصلی') as name
    union
    select split_part(value, '¦', 1), public._pm_js(value)->>'name'
      from public.lists where kind = 'پروژه' and value not like 'p1¦%'
  loop
    n := jsonb_build_object('id', p.id, 'name', coalesce(p.name, p.id));
    foreach t in array array['tasks', 'activities', 'issues', 'statements', 'contracts', 'letters', 'minutes'] loop
      if to_regclass('public.' || t) is null then continue; end if;
      execute format('select count(*) from public.%I where project_id = $1', t) into c using p.id;
      n := n || jsonb_build_object(t, c);
    end loop;
    with a as (
      select kind, split_part(value, '¦', 1) id, public._pm_js(value) j from public.lists
       where project_id = p.id and kind in ('زمان‌بندی', 'ثبت ریسک', 'تأخیر و آب‌وهوا', 'درخواست اطلاعات فنی', 'ارسال مدارک فنی', 'بازرسی و آزمون', 'مجوز کار', 'کد هزینه'))
    select n || jsonb_build_object(
      'sch_pct', (select round(sum(coalesce((j->>'pc')::numeric, 0) * greatest(coalesce((j->>'d')::numeric, 1), 1)) / nullif(sum(greatest(coalesce((j->>'d')::numeric, 1), 1)), 0), 1)
                    from a where kind = 'زمان‌بندی' and j is not null and not exists (select 1 from a b where b.kind = 'زمان‌بندی' and b.j->>'p' = a.id)),
      'sch_n', (select count(*) from a where kind = 'زمان‌بندی' and j is not null and not exists (select 1 from a b where b.kind = 'زمان‌بندی' and b.j->>'p' = a.id)),
      'risk_hi', (select count(*) from a where kind = 'ثبت ریسک' and j->>'st' in ('open', 'mit')
                    and coalesce(nullif(translate(j->>'p', '۰۱۲۳۴۵۶۷۸۹', '0123456789'), ''), '0')::integer * coalesce(nullif(translate(j->>'i', '۰۱۲۳۴۵۶۷۸۹', '0123456789'), ''), '0')::integer >= 15),
      'delay_days', (select coalesce(sum(nullif(regexp_replace(translate(coalesce(j->>'days', ''), '۰۱۲۳۴۵۶۷۸۹', '0123456789'), '[^0-9.]', '', 'g'), '')::numeric), 0) from a where kind = 'تأخیر و آب‌وهوا' and coalesce(j->>'st', '') <> 'no'),
      'rfi_open', (select count(*) from a where kind = 'درخواست اطلاعات فنی' and j->>'st' = 'open'),
      'sub_wait', (select count(*) from a where kind = 'ارسال مدارک فنی' and j->>'st' = 'sub'),
      'itp_wait', (select count(*) from a where kind = 'بازرسی و آزمون' and j->>'st' = 'req'),
      'ptw_wait', (select count(*) from a where kind = 'مجوز کار' and j->>'st' = 'req'),
      'budget', (select coalesce(sum(nullif(regexp_replace(coalesce(j->>'bud', ''), '[^0-9.]', '', 'g'), '')::numeric), 0) from a where kind = 'کد هزینه'),
      'actual', (select coalesce(sum(nullif(regexp_replace(coalesce(j->>'act', ''), '[^0-9.]', '', 'g'), '')::numeric), 0) from a where kind = 'کد هزینه'))
    into n;
    out := out || jsonb_build_array(n);
  end loop;
  return jsonb_build_object('ok', true, 'projects', out);
end $$;
revoke all on function public.pm_portfolio() from public;
grant execute on function public.pm_portfolio() to anon, authenticated;
