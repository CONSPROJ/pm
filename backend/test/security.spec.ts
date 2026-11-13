import 'reflect-metadata';
import { Client } from 'pg';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { migrate } from '../src/db/migrate';
import { bootstrap } from '../src/db/bootstrap';
import { createApp } from '../src/main';
import { loadConfig } from '../src/config';

const URL = process.env.TEST_DATABASE_URL || 'postgres://pm@127.0.0.1:55432/pmtest';
process.env.DATABASE_URL = URL;
let app: NestFastifyApplication, root = '', pid = '';
async function call(method: string, url: string, token?: string, payload?: unknown) {
  const r = await app.inject({ method: method as any, url: '/api/v1' + url, headers: token ? { authorization: 'Bearer ' + token } : {}, payload: payload as any });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
}
beforeAll(async () => {
  const c = new Client({ connectionString: URL }); await c.connect(); await c.query('drop schema public cascade; create schema public;'); await c.end();
  await migrate(URL, undefined, () => {}); await bootstrap(URL, 'root', 'ادمین', 'root-pass-123');
  app = await createApp(); await app.init(); await app.getHttpAdapter().getInstance().ready();
  root = (await call('POST', '/auth/login', undefined, { username: 'root', password: 'root-pass-123' })).body.token;
  pid = (await call('POST', '/projects', root, { name: 'امنیت' })).body.id;
});
afterAll(async () => { await app.close(); });

test('سرآیندهای امنیتی', async () => {
  const r = await call('GET', '/health');
  expect(r.headers['x-content-type-options']).toBe('nosniff');
  expect(String(r.headers['content-security-policy'])).toContain("default-src 'none'");
  expect(r.headers['x-ratelimit-limit']).toBeDefined();
});

test('تنظیمات نادرست: سرور بالا نمی‌آید', () => {
  expect(() => loadConfig({ DATABASE_URL: 'mysql://x' } as any)).toThrow();
  expect(() => loadConfig({ DATABASE_URL: URL, NODE_ENV: 'production' } as any)).toThrow(/CORS_ORIGINS/);
  expect(() => loadConfig({ DATABASE_URL: URL, NODE_ENV: 'production', CORS_ORIGINS: 'http://x.ir' } as any)).toThrow(/https/);
  expect(loadConfig({ DATABASE_URL: URL, NODE_ENV: 'production', CORS_ORIGINS: 'https://pm.x.ir' } as any).PORT).toBe(3100);
});

test('فعال‌سازی با لینک یک‌بارمصرف و سیاست رمز', async () => {
  const m = (await call('POST', `/projects/${pid}/members`, root, { username: 'sara', display_name: 'سارا', level: 3 })).body;
  expect((await call('POST', '/auth/login', undefined, { username: 'sara', password: 'anything1' })).status).toBe(401);   // هنوز فعال نشده
  const t = (await call('POST', `/projects/${pid}/members/${m.id}/invite`, root)).body.token;
  expect((await call('POST', '/auth/activate', undefined, { token: t, password: 'short1' })).status).toBe(400);
  expect((await call('POST', '/auth/activate', undefined, { token: t, password: 'onlyletters' })).status).toBe(400);
  const ok = await call('POST', '/auth/activate', undefined, { token: t, password: 'sara-pass-2026' });
  expect(ok.status).toBe(201); expect(ok.body.token).toBeTruthy();
  expect((await call('POST', '/auth/activate', undefined, { token: t, password: 'sara-pass-2026' })).status).toBe(400);   // یک‌بارمصرف
});

test('قفل حساب پس از ۵ ورود ناموفق؛ رمز درست هم در زمان قفل رد می‌شود', async () => {
  for (let i = 0; i < 5; i++) expect((await call('POST', '/auth/login', undefined, { username: 'sara', password: 'wrong-' + i })).status).toBe(401);
  expect((await call('POST', '/auth/login', undefined, { username: 'sara', password: 'sara-pass-2026' })).status).toBe(401);
  const c = new Client({ connectionString: URL }); await c.connect(); await c.query(`update users set locked_until = now() - interval '1 second' where username = 'sara'`); await c.end();
  expect((await call('POST', '/auth/login', undefined, { username: 'sara', password: 'sara-pass-2026' })).status).toBe(201);
});

test('تغییر رمز نشست‌های دیگر را باطل می‌کند', async () => {
  const a = (await call('POST', '/auth/login', undefined, { username: 'sara', password: 'sara-pass-2026' })).body.token;
  const b = (await call('POST', '/auth/login', undefined, { username: 'sara', password: 'sara-pass-2026' })).body.token;
  expect((await call('POST', '/auth/password', a, { current: 'bad', next: 'new-pass-2027' })).status).toBe(400);
  expect((await call('POST', '/auth/password', a, { current: 'sara-pass-2026', next: 'new-pass-2027' })).status).toBe(201);
  expect((await call('GET', '/auth/me', a)).status).toBe(200);
  expect((await call('GET', '/auth/me', b)).status).toBe(401);
});

test('خطای پایگاه داده پیام روشن می‌دهد، نه جزئیات داخلی', async () => {
  await call('POST', `/projects/${pid}/parties`, root, { kind: 'employer', name: 'کارفرما' });
  const dup = await call('POST', `/projects/${pid}/parties`, root, { kind: 'employer', name: 'کارفرما' });
  expect(dup.status).toBe(409);
  expect((await call('POST', `/projects/${pid}/parties`, root, { kind: 'نوع-ناموجود', name: 'x' })).status).toBe(400);
  expect((await call('GET', `/projects/not-a-uuid`, root)).status).toBe(400);
});
