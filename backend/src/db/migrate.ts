/* اجرای migrationها به ترتیب نام فایل؛ هر فایل یک بار و در یک تراکنش. */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

export async function migrate(url = process.env.DATABASE_URL, dir = join(__dirname, '..', '..', 'db', 'migrations'), log = console.log) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await c.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('begin');
      try {
        await c.query(readFileSync(join(dir, f), 'utf8'));
        await c.query('insert into schema_migrations(name) values ($1)', [f]);
        await c.query('commit');
        log('migrated ' + f);
      } catch (e) {
        await c.query('rollback');
        throw new Error(f + ': ' + (e as Error).message);
      }
    }
  } finally {
    await c.end();
  }
}

if (require.main === module) migrate().catch((e) => { console.error(e.message); process.exit(1); });
