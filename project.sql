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
  if p is null or p = 'p1' then return 'p1'; end if;
  if p !~ '^[a-z0-9]{2,24}$' then return null; end if;
  me := public.pm_me();
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

create or replace function public._pm_pj_global() returns trigger
language plpgsql
as $$
declare k text := '';
begin
  if tg_table_name in ('lists', 'nudges') then
    k := coalesce(to_jsonb(new)->>'kind', '');
  end if;
  if tg_table_name = 'lists' and k in ('دسترسی سطح','دسترسی نقش','دسترسی فرد','پروژه','عضو پروژه','دوره همکاری','کاور پروفایل','مرخصی','نام مستعار','امنیت سامانه','تنظیم آپلود','رشتهٔ افراد','نمای پیش‌فرض','زنجیرهٔ تأیید داخلی') then
    new.project_id := '*';
  elsif tg_table_name = 'nudges' and k in ('پیام','دعوت پروژه','پذیرش دعوت','واکنش','کاور پروفایل','امنیت سامانه') then
    new.project_id := '*';
  elsif new.project_id is null or new.project_id = '' or new.project_id = '-' then
    new.project_id := coalesce(public.pm_project(), '-');
  end if;
  return new;
end $$;

do $$
declare
  t text; c record; cols text; nm text;
  tabs text[] := array['activities','issues','machines','material_move','statements','contracts','minutes','letters','designs',
                       'tasks','workers','worker_daily','worker_ot','worker_changes','nudges','lists'];
begin
  foreach t in array tabs loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists project_id text', t);
    execute format('update public.%I set project_id = ''p1'' where project_id is null', t);
    execute format('alter table public.%I alter column project_id set default ''-''', t);
    execute format('alter table public.%I alter column project_id set not null', t);
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_idx', t);

    for c in select con.conname, con.conrelid, con.contype,
                    (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
                       from unnest(con.conkey) with ordinality k(attnum, ord)
                       join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cl
               from pg_constraint con
              where con.conrelid = ('public.' || t)::regclass and con.contype in ('u', 'p')
                and not (con.contype = 'p' and array_length(con.conkey, 1) = 1)
                and not exists (select 1 from unnest(con.conkey) x join pg_attribute a on a.attrelid = con.conrelid and a.attnum = x where a.attname = 'project_id')
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
      if c.contype = 'p' then
        execute format('alter table public.%I add constraint %I primary key (%s, project_id)', t, c.conname, c.cl);
      else
        execute format('alter table public.%I add constraint %I unique (%s, project_id)', t, c.conname, c.cl);
      end if;
    end loop;

    for c in select i.indexrelid::regclass::text as iname,
                    (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
                       from unnest(i.indkey::int2[]) with ordinality k(attnum, ord)
                       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as cl
               from pg_index i
              where i.indrelid = ('public.' || t)::regclass and i.indisunique and not i.indisprimary
                and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid)
                and i.indexprs is null
                and not exists (select 1 from unnest(i.indkey::int2[]) x join pg_attribute a on a.attrelid = i.indrelid and a.attnum = x where a.attname = 'project_id')
    loop
      nm := split_part(c.iname, '.', 2); if nm = '' then nm := c.iname; end if;
      execute format('drop index %s', c.iname);
      execute format('create unique index %I on public.%I (%s, project_id)', nm, t, c.cl);
    end loop;

    execute format('drop trigger if exists pm_pj_global on public.%I', t);
    execute format('create trigger pm_pj_global before insert on public.%I for each row execute function public._pm_pj_global()', t);

    execute format('drop policy if exists "pm project read" on public.%I', t);
    execute format('drop policy if exists "pm project write" on public.%I', t);
    execute format('drop policy if exists "pm project update" on public.%I', t);
    execute format('drop policy if exists "pm project delete" on public.%I', t);
    execute format('create policy "pm project read" on public.%I as restrictive for select using (project_id = ''*'' or project_id = (select public.pm_project()))', t);
    execute format('create policy "pm project write" on public.%I as restrictive for insert with check (project_id = ''*'' or project_id = (select public.pm_project()))', t);
    execute format('create policy "pm project update" on public.%I as restrictive for update using (project_id = ''*'' or project_id = (select public.pm_project())) with check (project_id = ''*'' or project_id = (select public.pm_project()))', t);
    execute format('create policy "pm project delete" on public.%I as restrictive for delete using (project_id = ''*'' or project_id = (select public.pm_project()))', t);
  end loop;
end $$;

update public.lists set project_id = '*'
 where kind in ('دسترسی سطح','دسترسی نقش','دسترسی فرد','پروژه','عضو پروژه','دوره همکاری','کاور پروفایل','مرخصی','نام مستعار','امنیت سامانه','تنظیم آپلود','رشتهٔ افراد','نمای پیش‌فرض','زنجیرهٔ تأیید داخلی');
update public.nudges set project_id = '*'
 where kind in ('پیام','دعوت پروژه','پذیرش دعوت','واکنش','کاور پروفایل','امنیت سامانه');

drop policy if exists "pm project registry" on public.lists;
create policy "pm project registry" on public.lists as restrictive for insert
  with check (kind not in ('پروژه','عضو پروژه') or (select public.pm_level()) <= 2 or (select public.pm_is_admin()));
drop policy if exists "pm project registry upd" on public.lists;
create policy "pm project registry upd" on public.lists as restrictive for update
  using (kind not in ('پروژه','عضو پروژه') or (select public.pm_level()) <= 2 or (select public.pm_is_admin()));
drop policy if exists "pm project registry del" on public.lists;
create policy "pm project registry del" on public.lists as restrictive for delete
  using (kind not in ('پروژه','عضو پروژه') or (select public.pm_level()) <= 2 or (select public.pm_is_admin()));

create or replace function public.pm_pj_accept(p_project text, p_ok boolean) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me(); r record; parts text[];
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into r from public.lists
   where kind = 'عضو پروژه' and split_part(value, '¦', 1) = p_project and split_part(value, '¦', 2) = me
     and split_part(value, '¦', 5) = 'دعوت'
   limit 1;
  if not found then raise exception 'no invitation'; end if;
  parts := string_to_array(r.value, '¦');
  parts[5] := case when p_ok then 'فعال' else 'رد' end;
  update public.lists set value = array_to_string(parts, '¦')
   where kind = r.kind and value = r.value and project_id = r.project_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.pm_pj_accept(text, boolean) from public;
grant execute on function public.pm_pj_accept(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
