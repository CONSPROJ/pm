import 'reflect-metadata';
import { Client } from 'pg';
import { migrate } from '../src/db/migrate';
import { bootstrap } from '../src/db/bootstrap';
import { importLegacy, jalaliToIso } from '../src/db/import-legacy';

const URL = process.env.TEST_DATABASE_URL || 'postgres://pm@127.0.0.1:55432/pmtest';

const backup = { tables: {
  people: [{ name: 'آقای مهدی نعیمی', role: 'کنترل پروژه', level: 1 }, { name: 'خانم سارا رضایی', role: 'طراح سازه', level: 4 }, { name: 'قدیمی', role: '', level: 3, active: false }],
  lists: [{ kind: 'پیمانکار — تماس', value: 'مهندسین مشاور نقش¦' + JSON.stringify({ t: 'cons', ro: 'طراح سازه', d: 'سازه' }) },
          { kind: 'پیمانکار — تماس', value: 'کارفرما¦' + JSON.stringify({ t: 'emp' }) }, { kind: 'دیگر', value: 'x' }],
  designs: [
    { id: 'd1', number: 'STR-001', title: 'پلان سازه', discipline: 'سازه', party: 'مهندسین مشاور نقش', revs: [
      { rev: '0', log: [{ st: 'دریافت', d: '۱۴۰۴/۰۱/۰۵' }, { st: 'نزد مشاور/کارفرما', d: '1404/01/12', side: 'cons' }, { st: 'نیاز به اصلاح', d: '1404/01/30' }] },
      { rev: '1', log: [{ st: 'دریافت', d: '1404/02/20' }, { st: 'تأیید مشروط', d: '1404/03/10' }] }] },
    { id: 'd2', number: 'ARC-001', title: 'پلان معماری', discipline: 'معماری، نما', party: 'تیم معماری تازه', revision: '0', sent_date: '1404/05/01', status: 'در حال بررسی' },
  ] } };

beforeAll(async () => {
  const c = new Client({ connectionString: URL }); await c.connect();
  await c.query('drop schema public cascade; create schema public;'); await c.end();
  await migrate(URL, undefined, () => {});
  await bootstrap(URL, 'root', 'ادمین', 'x-pass-1234');
});

test('تبدیل تاریخ شمسی', () => {
  expect(jalaliToIso('1404/01/01')).toBe('2025-03-21');
  expect(jalaliToIso('۱۴۰۵/۰۸/۲۱')).toBe('2026-11-12');
  expect(jalaliToIso('')).toBeNull();
});

test('انتقال تکرارپذیر: افراد، طرف‌ها، اسناد طراحی و ویرایش‌ها', async () => {
  const r1 = await importLegacy(URL, backup as any, 'پروژهٔ منتقل‌شده', 'root');
  const r2 = await importLegacy(URL, backup as any, 'پروژهٔ منتقل‌شده', 'root');
  expect(r2.project).toBe(r1.project);
  expect(r1).toMatchObject({ users: 3, documents: 2, revisions: 3 });
  const c = new Client({ connectionString: URL }); await c.connect();
  const q = async (s: string, p: unknown[] = []) => (await c.query(s, p)).rows;
  expect((await q('select count(*)::int n from documents'))[0].n).toBe(2);
  expect((await q('select count(*)::int n from revisions'))[0].n).toBe(3);
  expect((await q(`select kind from parties where name = 'مهندسین مشاور نقش'`))[0].kind).toBe('design_team');
  expect((await q(`select kind from parties where name = 'کارفرما'`))[0].kind).toBe('employer');
  expect((await q(`select count(*)::int n from parties where project_id = $1`, [r1.project]))[0].n).toBe(3);   // + «تیم معماری تازه»
  expect((await q(`select count(*)::int n from workflow_transitions where from_state is null`))[0].n).toBe(1);
  const rv = await q(`select r.rev, r.received_at::date::text as rcv, r.closed_at::date::text as cls, r.review_code from revisions r join documents d on d.id = r.document_id where d.number = 'STR-001' order by seq`);
  expect(rv).toEqual([{ rev: '0', rcv: '2025-03-25', cls: '2025-04-19', review_code: 'C' }, { rev: '1', rcv: '2025-05-10', cls: '2025-05-31', review_code: 'B' }]);
  const m = await q(`select u.display_name, m.level, m.status, p.title from memberships m join users u on u.id = m.user_id left join positions p on p.id = m.position_id where m.project_id = $1 order by u.display_name`, [r1.project]);
  expect(m.find((x: any) => x.display_name === 'خانم سارا رضایی')).toMatchObject({ level: 4, status: 'active', title: 'طراح سازه' });
  expect(m.find((x: any) => x.display_name === 'قدیمی')).toMatchObject({ status: 'left' });
  await c.end();
});
