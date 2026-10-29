create or replace function public.pm_whoami() returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare me text := public.pm_me(); tok text;
begin
  if me is not null then
    update public.people_sessions set last_seen = now()
     where name = me and last_seen < now() - interval '10 minutes';
    begin tok := coalesce(current_setting('request.headers', true)::json->>'x-pm-token', ''); exception when others then tok := ''; end;
    if length(tok) >= 32 then
      update public.people_sessions set expires_at = now() + interval '60 days'
       where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
         and expires_at < now() + interval '59 days';
    end if;
  end if;
  return jsonb_build_object('v', 1, 'name', me, 'admin', public.pm_is_admin(),
    'locked', exists(select 1 from pg_policies where schemaname = 'public' and policyname = 'pm logged in'));
end $$;
grant execute on function public.pm_whoami() to anon, authenticated;

alter table public.nudges add column if not exists updated_at timestamptz;
update public.nudges set updated_at = created_at where updated_at is null;
alter table public.nudges alter column updated_at set default now();

create or replace function public._pm_touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pm_nudges_touch on public.nudges;
create trigger pm_nudges_touch before update on public.nudges
  for each row execute function public._pm_touch_updated();

create index if not exists nudges_updated_at on public.nudges(updated_at desc);
create index if not exists nudges_created_at on public.nudges(created_at desc);
notify pgrst, 'reload schema';

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

do $$ begin
  if to_regprocedure('public.pm_level()') is null then raise exception 'اول مرحلهٔ ۴ امنیت را اجرا کنید.'; end if;
end $$;

create or replace function public.pm_party() returns text
language sql stable security definer
set search_path = public
as $$
  select nullif(btrim(split_part(value, '¦', 2)), '')
    from public.lists
   where kind = 'حساب طرف' and split_part(value, '¦', 1) = public.pm_me()
   limit 1
$$;
grant execute on function public.pm_party() to anon, authenticated;

create or replace function public.pm_party_ok(p text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.pm_level() is distinct from 8 then true
    when public.pm_party() is null then true
    else coalesce(p, '') ilike '%' || public.pm_party() || '%'
  end
$$;
grant execute on function public.pm_party_ok(text) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['statements', 'contracts', 'letters', 'designs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_party_ok(party)))', t);
    end if;
  end loop;
end $$;

drop policy if exists "pm ext link admin" on public.lists;
create policy "pm ext link admin" on public.lists as restrictive for insert
  with check (kind <> 'حساب طرف' or (select public.pm_is_admin()));
drop policy if exists "pm ext link admin del" on public.lists;
create policy "pm ext link admin del" on public.lists as restrictive for delete
  using (kind <> 'حساب طرف' or (select public.pm_is_admin()));

drop policy if exists "pm suggest" on public.lists;
create policy "pm suggest" on public.lists for insert
  with check ((select public.pm_me()) is not null and kind = 'پیشنهاد اصلاح');

select 'همه اجرا شد ✓' as "نتیجه";
