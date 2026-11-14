/*
 * مقایسهٔ دسترسی هر نفر بین سایت فعلی و سرور تازه — پیش از روز انتقال.
 * ورودی: فایلی که سایت فعلی می‌سازد (مرکز دسترسی ← «خروجی دسترسی برای انتقال»):
 *   {project, people: [{name, level, role, caps: {<کلید سایت>: true|false}}]}
 * هر کلید سایت به کلید سرور نگاشت می‌شود (CAP_MAP)؛ برای هر نفر اجازهٔ مؤثر سرور با همان موتور AuthzService حساب می‌شود
 * و تفاوت‌ها گزارش می‌شوند: «از دست می‌رود» (در سایت داشت، در سرور ندارد) و «تازه می‌گیرد».
 * اگر کسی چیزی از دست بدهد، خروجی با کد ۱ تمام می‌شود تا روز انتقال جلوی کار گرفته شود.
 * استفاده: DATABASE_URL=... npx ts-node src/db/compare-access.ts <access.json> "<نام پروژه>"
 */
import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { AuthzService } from '../authz/authz.service';

/** کلید سایت فعلی ← کلیدهای سرور (اگر یکی از کلیدهای سرور اجازه داشت، برابر است) */
export const CAP_MAP: Record<string, string[]> = {
  'tab.admin': ['doc.read'], 'doc.design': ['doc.read'], 'write.adm': ['doc.create'], 'adm.editAny': ['doc.edit'],
  'inbox.review': ['doc.review'], 'reg.trn': ['transmittal.send'], 'reg.smt': ['transmittal.send'],
  'doc.statement': ['statement.read'], 'doc.contract': ['contract.read'], 'doc.letter': ['letter.read'], 'doc.minute': ['minute.read'],
  'users.manage': ['people.manage', 'access.manage'], 'ctr.contact': ['parties.manage'], 'rep.adm': ['mdr.read'],
};

export interface PersonDiff { name: string; found: boolean; lost: string[]; gained: string[]; }

export async function compareAccess(url: string, data: { people: { name: string; caps: Record<string, boolean> }[] }, projectName: string): Promise<{ project: string; people: PersonDiff[]; lostTotal: number }> {
  const pool = new Pool({ connectionString: url });
  const db = { q: async (sql: string, p?: unknown[]) => (await pool.query(sql, p as any[])).rows, one: async (sql: string, p?: unknown[]) => (await pool.query(sql, p as any[])).rows[0] || null } as any;
  try {
    const pj = await db.one('select id from projects where name = $1', [projectName]);
    if (!pj) throw new Error('پروژه پیدا نشد: ' + projectName);
    const az = new AuthzService(db);
    const out: PersonDiff[] = []; let lostTotal = 0;
    for (const p of data.people || []) {
      const u = await db.one(`select id from users where display_name = $1 or username = $1`, [p.name]);
      if (!u) { out.push({ name: p.name, found: false, lost: [], gained: [] }); continue; }
      const ctx = await az.context(u.id, pj.id);
      const memo: Record<string, boolean> = {};
      const srv = async (k: string) => (memo[k] ??= (await az.decide(u.id, pj.id, k, ctx)).allowed);
      const lost: string[] = [], gained: string[] = [];
      for (const [site, keys] of Object.entries(CAP_MAP)) {
        if (!(site in (p.caps || {}))) continue;
        const had = !!p.caps[site];
        let has = false; for (const k of keys) if (await srv(k)) { has = true; break; }
        if (had && !has) lost.push(site + ' → ' + keys.join('|'));
        if (!had && has) gained.push(site + ' → ' + keys.join('|'));
      }
      lostTotal += lost.length;
      out.push({ name: p.name, found: true, lost, gained });
    }
    return { project: pj.id, people: out, lostTotal };
  } finally { await pool.end(); }
}

if (require.main === module) {
  const [file, project] = process.argv.slice(2);
  if (!file || !project) { console.error('استفاده: compare-access.ts <access.json> "<نام پروژه>"'); process.exit(2); }
  compareAccess(process.env.DATABASE_URL || '', JSON.parse(readFileSync(file, 'utf8')), project).then((r) => {
    for (const p of r.people) {
      if (!p.found) { console.log('✗ ' + p.name + ': در سرور تازه نیست'); continue; }
      if (!p.lost.length && !p.gained.length) { console.log('✓ ' + p.name); continue; }
      console.log((p.lost.length ? '✗ ' : '• ') + p.name);
      p.lost.forEach((x) => console.log('   از دست می‌رود: ' + x));
      p.gained.forEach((x) => console.log('   تازه می‌گیرد: ' + x));
    }
    console.log(r.lostTotal ? `\n${r.lostTotal} اجازه از دست می‌رود — پیش از انتقال در «دسترسی‌ها»ی سرور تازه اجازه بدهید.` : '\nهیچ‌کس اجازه‌ای از دست نمی‌دهد.');
    process.exit(r.lostTotal || r.people.some((p) => !p.found) ? 1 : 0);
  }).catch((e) => { console.error(e.message); process.exit(2); });
}
