-- ۵۰۱: صورتجلسه برای حاضرانش (خود شخص یا هم‌تیمی‌هایش) از سرور هم برگردد
create or replace function public.pm_nt(t text) returns text
language sql immutable
as $$
  select lower(trim(regexp_replace(regexp_replace(
    translate(replace(coalesce(t, ''), chr(8204), ' '), 'يىكۀة۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', 'ییکهه01234567890123456789'),
    '[^0-9A-Za-z_؀-ۿ\s]', ' ', 'g'), '\s+', ' ', 'g')))
$$;

create or replace function public.pm_md(t text) returns text
language sql immutable
as $$
  select case when m is null then '' else (m[1])::int || '/' || (m[2])::int || '/' || (m[3])::int end
    from (select regexp_match(translate(coalesce(t, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})') m) s
$$;

create or replace function public.pm_minute_att_ok(subj text, meet text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case when public.pm_party() is null then true else exists (
    select 1
      from public.lists l,
           lateral (select split_part(l.value, '¦', 1) k, substr(l.value, position('¦' in l.value) + 1) v) x
     where l.kind = 'حاضران صورتجلسه'
       and l.project_id in (coalesce(public.pm_project(), 'p1'), '*')
       and public.pm_md(split_part(x.k, '|', 2)) = public.pm_md(meet)
       and public.pm_md(meet) <> ''
       and split_part(x.k, '|', 1) <> ''
       and not exists (select 1 from regexp_split_to_table(split_part(x.k, '|', 1), '\s+') w
                        where w <> '' and position(' ' || w || ' ' in ' ' || public.pm_nt(subj) || ' ') = 0)
       and (x.v ilike '%"' || public.pm_me() || '"%'
            or x.v ilike '%"' || public.pm_party() || '"%'
            or exists (select 1 from public.lists a
                        where a.kind = 'حساب طرف'
                          and split_part(a.value, '¦', 2) ilike public.pm_party()
                          and split_part(a.value, '¦', 1) <> ''
                          and x.v ilike '%"' || split_part(a.value, '¦', 1) || '"%'))) end
$$;
revoke all on function public.pm_minute_att_ok(text, text) from public;
grant execute on function public.pm_minute_att_ok(text, text) to anon, authenticated;

do $$
begin
  if to_regclass('public.minutes') is not null then
    drop policy if exists "pm party scope" on public.minutes;
    create policy "pm party scope" on public.minutes as restrictive for select
      using ((select public.pm_doc_shared('minute', id::text))
             or (select public.pm_minute_att_ok(subject, meet_date))
             or case (select public.pm_doc_vis('minute')) when 'all' then true when 'none' then false else (select public.pm_party_txt_ok(minutes::text)) end);
  end if;
end $$;
