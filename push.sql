create table if not exists public.push_subs (
  endpoint   text primary key,
  name       text not null,
  sub        jsonb not null,
  ua         text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subs_name on public.push_subs(name);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;

create or replace function public.pm_push_sub(p_sub jsonb, p_ua text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me(); ep text := p_sub->>'endpoint';
begin
  if me is null then raise exception 'not signed in'; end if;
  if ep is null or ep !~ '^https://' or length(ep) > 1000 or p_sub->'keys'->>'p256dh' is null or p_sub->'keys'->>'auth' is null then
    raise exception 'bad subscription';
  end if;
  insert into public.push_subs(endpoint, name, sub, ua)
  values (ep, me, jsonb_build_object('endpoint', ep, 'keys', p_sub->'keys'), left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set name = excluded.name, sub = excluded.sub, ua = excluded.ua, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pm_push_unsub(p_endpoint text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me();
begin
  if me is null then return jsonb_build_object('ok', false); end if;
  delete from public.push_subs where endpoint = p_endpoint and name = me;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.pm_push_sub(jsonb, text) from public;
revoke all on function public.pm_push_unsub(text) from public;
grant execute on function public.pm_push_sub(jsonb, text) to anon, authenticated;
grant execute on function public.pm_push_unsub(text) to anon, authenticated;
