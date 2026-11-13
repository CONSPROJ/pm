import 'reflect-metadata';
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { migrate } from '../src/db/migrate';
import { bootstrap } from '../src/db/bootstrap';
import { createApp } from '../src/main';

const URL = process.env.TEST_DATABASE_URL || 'postgres://pm@127.0.0.1:55432/pmtest';
process.env.DATABASE_URL = URL;

let app: NestFastifyApplication;
let root = '', ali = '', pid = '';
const ids: Record<string, string> = {};

async function call(method: string, url: string, token?: string, payload?: unknown) {
  const r = await app.inject({ method: method as any, url: '/api/v1' + url, headers: token ? { authorization: 'Bearer ' + token } : {}, payload: payload as any });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
}

beforeAll(async () => {
  const c = new Client({ connectionString: URL }); await c.connect();
  await c.query('drop schema public cascade; create schema public;'); await c.end();
  await migrate(URL, undefined, () => {});
  await bootstrap(URL, 'root', 'ادمین اصلی', 'root-pass-123');
  app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  root = (await call('POST', '/auth/login', undefined, { username: 'root', password: 'root-pass-123' })).body.token;
});
afterAll(async () => { await app.close(); });

test('ورود نادرست رد می‌شود و بدون توکن چیزی باز نیست', async () => {
  expect((await call('POST', '/auth/login', undefined, { username: 'root', password: 'x' })).status).toBe(401);
  expect((await call('GET', '/projects')).status).toBe(401);
});

test('ساختن پروژه، طرف‌ها، رشته‌ها، گردش‌کار و نوع سند', async () => {
  const p = await call('POST', '/projects', root, { name: 'پروژهٔ طراحی', phase: 'design1', use_type: 'مسکونی' });
  expect(p.status).toBe(201); pid = p.body.id;
  ids.dt = (await call('POST', `/projects/${pid}/parties`, root, { kind: 'design_team', name: 'مهندسین مشاور نقش', disciplines: ['STR'] })).body.id;
  ids.emp = (await call('POST', `/projects/${pid}/parties`, root, { kind: 'employer', name: 'کارفرما' })).body.id;
  expect((await call('PUT', `/projects/${pid}/disciplines`, root, [{ code: 'ARC', name: 'معماری' }, { code: 'STR', name: 'سازه' }])).status).toBe(200);
  const wf = await call('PUT', `/projects/${pid}/workflows`, root, { name: 'طراحی', states: [
    { code: 'RCV', name: 'دریافت', category: 'in_review', holder_kind: 'pm' },
    { code: 'CON', name: 'نزد مشاور', category: 'in_review', holder_kind: 'consultant', limit_days: 7 },
    { code: 'C', name: 'نیاز به اصلاح', category: 'returned', review_code: 'C', holder_kind: 'design_team' },
    { code: 'A', name: 'تأیید', category: 'approved', review_code: 'A' }],
    transitions: [{ from: null, to: 'RCV' }, { from: 'RCV', to: 'CON' }, { from: 'CON', to: 'C' }, { from: 'CON', to: 'A' }] });
  expect(wf.status).toBe(200);
  expect((await call('PUT', `/projects/${pid}/doc-types`, root, [{ code: 'DWG', name: 'نقشه', workflow: 'طراحی' }])).status).toBe(200);
});

test('عضو تیم طراحی با سمت و طرف؛ دسترسی پیش‌فرض از سطح', async () => {
  const pos = await call('POST', `/projects/${pid}/positions`, root, { title: 'طراح سازه', party_id: ids.dt, disciplines: ['STR'], approved: true });
  const m = await call('POST', `/projects/${pid}/members`, root, { username: 'ali', display_name: 'علی طراح', position_id: pos.body.id, party_id: ids.dt, level: 4, status: 'active' });
  expect(m.status).toBe(201);
  const c = new Client({ connectionString: URL }); await c.connect();
  await c.query(`update users set password_hash = $1, status = 'active' where username = 'ali'`, [await bcrypt.hash('ali-pass-123', 4)]); await c.end();
  ali = (await call('POST', '/auth/login', undefined, { username: 'ali', password: 'ali-pass-123' })).body.token;
  const me = (await call('GET', `/projects/${pid}/access/me`, ali)).body;
  expect(me['doc.read'].allowed).toBe(true);
  expect(me['doc.read'].source).toBe('default');
  expect(me['statement.read'].allowed).toBe(false);
  expect(me['access.manage'].allowed).toBe(false);
  expect((await call('GET', `/projects/${pid}/access/matrix`, ali)).status).toBe(403);
});

test('محدودیت رشته از نوع طرف، و منع فرد بر اجازهٔ گروه مقدم است', async () => {
  const a = await call('POST', `/projects/${pid}/documents`, root, { type: 'DWG', number: 'P-ARC-001', title: 'پلان معماری', discipline: 'ARC', planned_issue: '2026-01-01' });
  const s = await call('POST', `/projects/${pid}/documents`, root, { type: 'DWG', number: 'P-STR-001', title: 'پلان سازه', discipline: 'STR', originator_id: ids.dt, planned_issue: '2026-01-01' });
  expect(a.status).toBe(201); expect(s.status).toBe(201); ids.str = s.body.id; ids.arc = a.body.id;
  expect((await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'party_kind', subject_id: 'design_team', capability_key: 'doc.read', effect: 'allow', constraints: { disciplines: ['STR'] } })).status).toBe(200);
  const L = (await call('GET', `/projects/${pid}/documents`, ali)).body;
  expect(L.map((d: any) => d.number)).toEqual(['P-STR-001']);
  expect((await call('GET', `/projects/${pid}/documents/${ids.arc}`, ali)).status).toBe(404);
  // محدودیتی که این اجازه نمی‌پذیرد رد می‌شود
  expect((await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'level', subject_id: '4', capability_key: 'project.read', effect: 'allow', constraints: { disciplines: ['STR'] } })).status).toBe(403);
  // منع در لایهٔ فرد
  const g = await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'user', subject_id: (await call('GET', '/auth/me', ali)).body.id, capability_key: 'doc.read', effect: 'deny' });
  expect((await call('GET', `/projects/${pid}/documents`, ali)).status).toBe(403);
  const ex = (await call('GET', `/projects/${pid}/access/explain?user=${(await call('GET', '/auth/me', ali)).body.id}`, root)).body;
  expect(ex['doc.read']).toMatchObject({ allowed: false, source: 'user' });
  await call('DELETE', `/projects/${pid}/access/grants/${g.body.id}`, root);
  expect((await call('GET', `/projects/${pid}/documents`, ali)).status).toBe(200);
});

test('گردش‌کار: فقط گذارهای تعریف‌شده؛ زمان اصلاح بین ویرایش‌ها حساب می‌شود', async () => {
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/revisions`, root, { rev: '0', received_at: '2026-01-01T08:00:00Z' })).status).toBe(201);
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/transition`, root, { to: 'A' })).status).toBe(400);   // RCV → A تعریف نشده
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/transition`, root, { to: 'CON', at: '2026-01-02T08:00:00Z' })).status).toBe(201);
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/transition`, ali, { to: 'C', at: '2026-01-10T08:00:00Z' })).status).toBe(201);   // سطح ۴ پیش‌فرض doc.review دارد
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/revisions`, root, { rev: '1', received_at: '2026-01-25T08:00:00Z' })).status).toBe(201);
  const d = (await call('GET', `/projects/${pid}/documents/${ids.str}`, root)).body;
  expect(d.revisions).toHaveLength(2);
  expect(d.revisions[0].review_days).toBe(9);
  expect(d.revisions[1].resubmit_days).toBe(15);
  expect(d.revisions[0].steps.find((x: any) => x.state_code === 'CON').over).toBe(true);   // ۸ روز > مهلت ۷
  expect(d.summary.resubmit_days).toBe(15);
});

test('قوانین: نوع مقدار کنترل می‌شود، تغییر و بازگشت به پیش‌فرض', async () => {
  expect((await call('PUT', `/projects/${pid}/settings/doc.near_due_days`, root, { value: 'زیاد' })).status).toBe(400);
  expect((await call('PUT', `/projects/${pid}/settings/doc.near_due_days`, root, { value: 5 })).status).toBe(200);
  let L = (await call('GET', `/projects/${pid}/settings`, root)).body;
  expect(L.find((x: any) => x.key === 'doc.near_due_days').value).toBe(5);
  expect((await call('PUT', `/projects/${pid}/settings/doc.near_due_days`, ali, { value: 9 })).status).toBe(403);
  await call('DELETE', `/projects/${pid}/settings/doc.near_due_days`, root);
  L = (await call('GET', `/projects/${pid}/settings`, root)).body;
  expect(L.find((x: any) => x.key === 'doc.near_due_days').value).toBe(3);
});

test('MDR و گزارش کار', async () => {
  const m = (await call('GET', `/projects/${pid}/mdr`, root)).body;
  expect(m.summary.documents).toBe(2);
  expect(m.summary.issued).toBe(1);
  expect(m.summary.late).toBe(1);   // معماری ارسال‌نشده و موعدش گذشته؛ سازه سر موعد ارسال شد
  const a = (await call('GET', `/projects/${pid}/audit`, root)).body;
  expect(a.some((x: any) => x.action === 'transition')).toBe(true);
  expect((await call('GET', `/projects/${pid}/audit`, ali)).status).toBe(403);
});

test('ادمین اصلی را کسی جز خودش تغییر نمی‌دهد', async () => {
  const mem = (await call('GET', `/projects/${pid}/members`, root)).body.find((x: any) => x.username === 'root');
  // علی اجازهٔ people.manage می‌گیرد ولی باز هم نمی‌تواند ادمین اصلی را تغییر دهد
  const aliId = (await call('GET', '/auth/me', ali)).body.id;
  await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'user', subject_id: aliId, capability_key: 'people.manage', effect: 'allow' });
  expect((await call('PATCH', `/projects/${pid}/members/${mem.id}`, ali, { status: 'left' })).status).toBe(403);
  expect((await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'user', subject_id: mem.user_id, capability_key: 'doc.read', effect: 'deny' })).status).toBe(403);
});

test('CRS: ثبت نظر، پاسخ فقط طراحِ همان مدرک، بستن فقط با اجازه', async () => {
  const c1 = await call('POST', `/projects/${pid}/documents/${ids.str}/comments`, root, { body: 'آرماتور تیر B3 کافی نیست', party_kind: 'consultant' });
  expect(c1.status).toBe(201); expect(c1.body.seq).toBe(1);
  // پاسخ فقط طرف طراح همین مدرک (محدودیت own_party روی اجازهٔ پاسخ)
  await call('PUT', `/projects/${pid}/access/grants`, root, { subject_type: 'party_kind', subject_id: 'design_team', capability_key: 'doc.comment.reply', effect: 'allow', constraints: { own_party: true } });
  const r = await call('POST', `/projects/${pid}/documents/${ids.str}/comments/${c1.body.id}`, ali, { action: 'reply', response: 'در ویرایش ۱ اصلاح شد' });
  expect(r.status).toBe(201); expect(r.body.status).toBe('answered');
  expect((await call('POST', `/projects/${pid}/documents/${ids.str}/comments/${c1.body.id}`, ali, { action: 'close' })).status).toBe(403);   // سطح ۴ پیش‌فرض بستن ندارد
  const cl = await call('POST', `/projects/${pid}/documents/${ids.str}/comments/${c1.body.id}`, root, { action: 'close' });
  expect(cl.body.status).toBe('closed');
  const L = (await call('GET', `/projects/${pid}/documents/${ids.str}/comments`, ali)).body;
  expect(L).toHaveLength(1); expect(L[0]).toMatchObject({ status: 'closed', rev: '1', closed_rev: '1' });   // نظر روی ویرایش جاری (Rev 1) ثبت شد
});
