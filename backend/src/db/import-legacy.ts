/*
 * انتقال دادهٔ سایت فعلی به ساختار تازه — از روی فایل پشتیبانی که خود سایت می‌سازد
 * (امنیت و پشتیبان ← دانلود پشتیبان: {tables: {people, designs, lists, …}}).
 * مرحله‌به‌مرحله و تکرارپذیر: هر بار اجرا، همان رکوردها را به‌روز می‌کند و چیزی تکراری نمی‌سازد.
 *   مرحلهٔ ۱: افراد → users + عضویت (سطح) + سمت‌ها (از نقش‌ها)
 *   مرحلهٔ ۲: طرف‌ها (پروندهٔ تماس پیمانکاران/مشاوران/کارفرما) → parties
 *   مرحلهٔ ۳: اسناد طراحی → رشته‌ها، نوع سند، گردش‌کار، مدارک، ویرایش‌ها و رویدادهای هر ویرایش
 * استفاده: DATABASE_URL=... npx ts-node src/db/import-legacy.ts <backup.json> "<نام پروژه>"
 */
import { readFileSync } from 'fs';
import { Client, PoolClient } from 'pg';

type Row = Record<string, any>;
export interface ImportReport { project: string; users: number; parties: number; disciplines: number; documents: number; revisions: number; events: number; skipped: string[]; }

/* ---------- تاریخ شمسی ← میلادی ---------- */
const toEnDigits = (s: string) => String(s || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
export function jalaliToIso(fa: string | null | undefined): string | null {
  const m = /(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec(toEnDigits(fa || ''));
  if (!m) return null;
  let jy = +m[1], jm = +m[2], jd = +m[3];
  if (jy < 1300 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const ml = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1; for (; gm <= 12 && gd > ml[gm]; gm++) gd -= ml[gm];
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/* ---------- نگاشت وضعیت‌های فعلی اسناد طراحی ---------- */
const STATE_MAP: Record<string, { code: string; category: string; review_code?: string }> = {
  'دریافت': { code: 'RCV', category: 'in_review' },
  'در حال بررسی': { code: 'REV', category: 'in_review' },
  'نزد مشاور/کارفرما': { code: 'EXT', category: 'in_review' },
  'نیاز به اصلاح': { code: 'C', category: 'returned', review_code: 'C' },
  'رد شده': { code: 'D', category: 'returned', review_code: 'D' },
  'تأیید مشروط': { code: 'B', category: 'approved', review_code: 'B' },
  'تأیید شده': { code: 'A', category: 'approved', review_code: 'A' },
  'برای اجرا': { code: 'IFC', category: 'approved', review_code: 'IFC' },
};
const SIDE_KIND: Record<string, string> = { emp: 'employer', cons: 'consultant', ctr: 'contractor', pm: 'pm', own: 'owner', sup: 'supplier' };
const PARTY_KIND: Record<string, string> = { ctr: 'contractor', cons: 'consultant', emp: 'employer', sup: 'supplier', own: 'owner' };

function parseRevs(r: Row): { rev: string; log: { st: string; d?: string; by?: string; side?: string; note?: string }[]; note?: string }[] {
  let v = r.revs ?? r['ویرایش‌ها'];
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  if (Array.isArray(v) && v.length) return v.map((x: any) => ({ rev: String(x.rev ?? '0'), note: x.note, log: Array.isArray(x.log) ? x.log.filter((l: any) => l && l.st) : [] }));
  const log = [{ st: 'دریافت', d: r.sent_date || r.date_fa }];
  if (r.status) log.push({ st: r.status, d: '' as any });
  return [{ rev: String(r.revision ?? '0'), log }];
}

export async function importLegacy(url: string, data: { tables: Record<string, Row[]> }, projectName: string, actorUsername?: string): Promise<ImportReport> {
  const c = new Client({ connectionString: url }); await c.connect();
  const rep: ImportReport = { project: '', users: 0, parties: 0, disciplines: 0, documents: 0, revisions: 0, events: 0, skipped: [] };
  const T = data.tables || {};
  try {
    await c.query('begin');
    const actor = actorUsername ? (await c.query('select id from users where username = $1', [actorUsername])).rows[0]?.id ?? null : null;
    let p = (await c.query('select id from projects where name = $1', [projectName])).rows[0];
    if (!p) p = (await c.query(`insert into projects (name, info, created_by) values ($1, '{"imported":true}', $2) returning id`, [projectName, actor])).rows[0];
    const pid: string = p.id; rep.project = pid;

    // ---- ۱) افراد ----
    const posByTitle = new Map<string, string>();
    for (const r of T.people || []) {
      const name = String(r.name || '').trim(); if (!name) continue;
      const u = (await c.query(`insert into users (username, display_name, status) values ($1,$1,$2)
          on conflict (username) do update set display_name = excluded.display_name returning id, is_root`, [name, r.active === false ? 'disabled' : 'pending'])).rows[0];
      let posId: string | null = null; const role = String(r.role || '').trim();
      if (role) {
        posId = posByTitle.get(role) ?? (await c.query('select id from positions where project_id = $1 and title = $2', [pid, role])).rows[0]?.id ?? null;
        if (!posId) posId = (await c.query('insert into positions (project_id, title, approved) values ($1,$2,true) returning id', [pid, role])).rows[0].id;
        posByTitle.set(role, posId!);
      }
      const lv = Number(r.level); const level = isFinite(lv) && lv >= 1 && lv <= 9 ? lv : null;
      await c.query(`insert into memberships (project_id, user_id, position_id, level, status) values ($1,$2,$3,$4,$5)
          on conflict (project_id, user_id) do update set position_id = coalesce(excluded.position_id, memberships.position_id), level = coalesce(excluded.level, memberships.level)`,
        [pid, u.id, posId, level, r.active === false ? 'left' : 'active']);
      rep.users++;
    }

    // ---- ۲) طرف‌ها ----
    const partyByName = new Map<string, string>();
    for (const r of (T.lists || []).filter((x) => x.kind === 'پیمانکار — تماس')) {
      const v = String(r.value || ''); const i = v.indexOf('¦'); if (i < 1) continue;
      const name = v.slice(0, i).trim(); let o: Row = {}; try { o = JSON.parse(v.slice(i + 1)) || {}; } catch { rep.skipped.push('تماس نامعتبر: ' + name); continue; }
      const kind = o.t === 'cons' && /طراح/.test(String(o.ro || '')) ? 'design_team' : (PARTY_KIND[o.t] || 'contractor');
      const id = (await c.query(`insert into parties (project_id, kind, name, disciplines, info) values ($1,$2,$3,$4,$5)
          on conflict (project_id, name) do update set kind = excluded.kind, disciplines = excluded.disciplines, info = excluded.info returning id`,
        [pid, kind, name, o.d ? String(o.d).split(/\s*[،,]\s*/).filter(Boolean) : [], JSON.stringify(o)])).rows[0].id;
      partyByName.set(name, id); rep.parties++;
    }
    const partyOf = async (n: string) => {
      const name = String(n || '').trim(); if (!name) return null;
      if (partyByName.has(name)) return partyByName.get(name)!;
      const id = (await c.query(`insert into parties (project_id, kind, name) values ($1,'design_team',$2) on conflict (project_id, name) do update set name = excluded.name returning id`, [pid, name])).rows[0].id;
      partyByName.set(name, id); rep.parties++; return id;
    };

    // ---- ۳) اسناد طراحی ----
    const designs = T.designs || [];
    if (designs.length) {
      const wf = (await c.query(`insert into workflows (project_id, name) values ($1, 'گردش اسناد طراحی (منتقل‌شده)') on conflict (project_id, name) do update set name = excluded.name returning id`, [pid])).rows[0].id;
      const stateId = new Map<string, string>(); let sort = 0;
      const ensureState = async (st: string) => {
        const m = STATE_MAP[st] || { code: 'S' + (stateId.size + 1), category: 'in_review' };
        if (stateId.has(st)) return stateId.get(st)!;
        const id = (await c.query(`insert into workflow_states (workflow_id, code, name, category, review_code, sort) values ($1,$2,$3,$4,$5,$6)
            on conflict (workflow_id, code) do update set name = excluded.name returning id`, [wf, m.code, st, m.category, m.review_code ?? null, sort++])).rows[0].id;
        stateId.set(st, id); return id;
      };
      const rcv = await ensureState('دریافت');
      await c.query(`insert into workflow_transitions (workflow_id, from_state, to_state) select $1, null, $2 where not exists (select 1 from workflow_transitions where workflow_id = $1 and from_state is null and to_state = $2)`, [wf, rcv]);
      const type = (await c.query(`insert into doc_types (project_id, code, name, workflow_id) values ($1,'DSN','سند طراحی',$2) on conflict (project_id, code) do update set workflow_id = excluded.workflow_id returning id`, [pid, wf])).rows[0].id;
      const discId = new Map<string, string>();
      const seenTr = new Set<string>();
      for (const r of designs) {
        const number = String(r.number || '').trim() || ('LEGACY-' + String(r.id || '').slice(0, 8));
        const title = String(r.title || number).trim();
        const disc = String(r.discipline || '').split(/\s*[،,]\s*/)[0]?.trim();
        let did: string | null = null;
        if (disc) {
          did = discId.get(disc) ?? null;
          if (!did) { did = (await c.query(`insert into disciplines (project_id, code, name) values ($1,$2,$2) on conflict (project_id, code) do update set name = excluded.name returning id`, [pid, disc])).rows[0].id; discId.set(disc, did!); rep.disciplines++; }
        }
        const originator = await partyOf(r.party);
        const doc = (await c.query(`insert into documents (project_id, type_id, number, title, discipline_id, originator_id, info, created_at)
            values ($1,$2,$3,$4,$5,$6,$7, coalesce($8::timestamptz, now()))
            on conflict (project_id, number) do update set title = excluded.title, discipline_id = excluded.discipline_id, originator_id = excluded.originator_id, info = excluded.info returning id`,
          [pid, type, number, title, did, originator, JSON.stringify({ legacy_id: r.id, floor: r.floor, zone: r.zone, origin: r.origin, doc_type: r.doc_type, note: r.note }), r.created_at ?? null])).rows[0].id;
        await c.query('delete from revisions where document_id = $1', [doc]);   // تکرارپذیر: ویرایش‌ها از نو
        let seq = 0, lastState: string | null = null;
        for (const rv of parseRevs(r)) {
          seq++;
          const L = rv.log.length ? rv.log : [{ st: 'دریافت', d: '' }];
          const first = jalaliToIso(L[0].d || '') ;
          const finIdx = [...L].reverse().findIndex((x) => STATE_MAP[x.st] && ['approved', 'returned'].includes(STATE_MAP[x.st].category));
          const fin = finIdx >= 0 ? L[L.length - 1 - finIdx] : null;
          const curSt = await ensureState(L[L.length - 1].st);
          const rid = (await c.query(`insert into revisions (document_id, rev, seq, received_at, state_id, review_code, closed_at, note) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
            [doc, rv.rev, seq, first, curSt, fin ? (STATE_MAP[fin.st]?.review_code ?? null) : null, fin ? jalaliToIso(fin.d || '') : null, rv.note ?? null])).rows[0].id;
          rep.revisions++;
          let prev: string | null = null, prevAt = first;
          for (const e of L) {
            const sid = await ensureState(e.st);
            const at = jalaliToIso(e.d || '') || prevAt;
            if (!at) { rep.skipped.push(number + ' Rev ' + rv.rev + ': مرحلهٔ «' + e.st + '» بی‌تاریخ'); continue; }
            await c.query(`insert into revision_events (revision_id, state_id, at, holder_party, note) values ($1,$2,$3,$4,$5)`,
              [rid, sid, at, e.side && SIDE_KIND[e.side] === 'consultant' ? originator : null, [e.by ? 'ثبت: ' + e.by : '', e.note || ''].filter(Boolean).join(' · ') || null]);
            rep.events++;
            const k = (prev || '∅') + '>' + sid;
            if (prev && !seenTr.has(k)) { seenTr.add(k); await c.query(`insert into workflow_transitions (workflow_id, from_state, to_state) values ($1,$2,$3) on conflict do nothing`, [wf, prev, sid]); }
            prev = sid; prevAt = at;
          }
          lastState = curSt;
        }
        await c.query('update documents set current_state_id = $2 where id = $1', [doc, lastState]);
        // CRS سایت فعلی: lists «نظرات بررسی طراحی» با شناسهٔ سند قدیمی
        const crs = (T.lists || []).find((x) => x.kind === 'نظرات بررسی طراحی' && String(x.value || '').startsWith(String(r.id) + '\u00a6'));
        if (crs) {
          await c.query('delete from review_comments where document_id = $1', [doc]);
          let items: Row[] = []; try { items = (JSON.parse(String(crs.value).slice(String(r.id).length + 1)) || {}).items || []; } catch { rep.skipped.push(number + ': CRS نامعتبر'); }
          const SIDE: Record<string, string> = { cons: 'consultant', emp: 'employer', pm: 'pm', des: 'design_team' };
          let k = 0;
          for (const it of items) {
            const rv = (await c.query('select id from revisions where document_id = $1 and rev = $2 order by seq desc limit 1', [doc, String(it.rev ?? '')])).rows[0];
            const cr = it.cr != null ? (await c.query('select id from revisions where document_id = $1 and rev = $2 order by seq desc limit 1', [doc, String(it.cr)])).rows[0] : null;
            await c.query(`insert into review_comments (document_id, revision_id, seq, party_kind, author_name, body, response, responded_at, status, closed_in_rev, closed_at, created_at)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, coalesce($12::timestamptz, now()))`,
              [doc, rv?.id ?? null, ++k, SIDE[it.side] ?? null, it.by ?? null, String(it.t || ''), it.r || null, jalaliToIso(it.rd), it.st === 'closed' ? 'closed' : it.st === 'ans' ? 'answered' : 'open', cr?.id ?? null, it.st === 'closed' ? jalaliToIso(it.cd) : null, jalaliToIso(it.d)]);
          }
        }
        rep.documents++;
      }
    }
    await c.query('insert into audit_log (actor_id, project_id, action, entity, data) values ($1,$2,$3,$4,$5)', [actor, pid, 'import', 'legacy', JSON.stringify({ ...rep, skipped: rep.skipped.length })]);
    await c.query('commit');
    return rep;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const [file, name] = process.argv.slice(2);
  if (!file || !name) { console.error('استفاده: import-legacy <backup.json> "<نام پروژه>"'); process.exit(1); }
  importLegacy(process.env.DATABASE_URL!, JSON.parse(readFileSync(file, 'utf8')), name, process.env.IMPORT_ACTOR)
    .then((r) => { console.log(JSON.stringify({ ...r, skipped: r.skipped.slice(0, 50), skipped_total: r.skipped.length }, null, 2)); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
export type { PoolClient };
