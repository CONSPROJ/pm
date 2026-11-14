alter table public.audit_log add column if not exists project_id text not null default '*';
update public.audit_log set project_id = coalesce(nullif(data->>'project_id', ''), case when tbl in ('auth', 'people', 'people_auth', 'people_sessions') then '*' else 'p1' end)
 where project_id = '*' and tbl not in ('auth');
create index if not exists audit_log_pj on public.audit_log(project_id, at desc);

create or replace function public._pm_audit() returns trigger
language plpgsql security definer
set search_path = public
as $$
declare o jsonb; n jsonb; d jsonb := '{}'::jsonb; k text; rid text; pj text;
begin
  if tg_op = 'DELETE' then
    o := to_jsonb(old); d := o;
  elsif tg_op = 'INSERT' then
    n := to_jsonb(new); d := n;
  else
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if (o -> k) is distinct from (n -> k) and k not in ('updated_at') then
        d := d || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
  end if;
  rid := coalesce(coalesce(n, o) ->> 'id', coalesce(n, o) ->> 'name', coalesce(n, o) ->> 'kind');
  pj := coalesce(nullif(coalesce(n, o) ->> 'project_id', ''), case when tg_table_name in ('people', 'people_auth', 'people_sessions') then '*' else public.pm_project() end, '*');
  d := d - 'password_hash' - 'pw_bcrypt' - 'pass_hash';
  insert into public.audit_log(who, tbl, op, row_id, data, project_id)
  values (public.pm_me(), tg_table_name, tg_op, rid, d, pj);
  if random() < 0.002 then delete from public.audit_log where at < now() - interval '400 days'; end if;
  return null;
end $$;
revoke all on function public._pm_audit() from public, anon, authenticated;

drop policy if exists "pm audit read" on public.audit_log;
create policy "pm audit read" on public.audit_log for select
  using ((select public.pm_is_admin()) and (project_id = '*' or project_id = (select public.pm_project())));

notify pgrst, 'reload schema';
