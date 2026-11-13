/* ساختن کاربر صفر (یک بار): BOOT_USER و BOOT_PASSWORD از محیط خوانده می‌شود، رمز هرگز در کد یا مخزن نیست. */
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

export async function bootstrap(url = process.env.DATABASE_URL, username = process.env.BOOT_USER, displayName = process.env.BOOT_NAME || process.env.BOOT_USER, password = process.env.BOOT_PASSWORD) {
  if (!username || !password) throw new Error('BOOT_USER و BOOT_PASSWORD لازم است');
  const c = new Client({ connectionString: url }); await c.connect();
  try {
    const has = (await c.query('select id from users where is_root')).rows[0];
    if (has) return has.id as string;
    const r = await c.query(`insert into users (username, display_name, password_hash, is_root, status) values ($1,$2,$3,true,'active') returning id`, [username, displayName, await bcrypt.hash(password, 11)]);
    return r.rows[0].id as string;
  } finally { await c.end(); }
}
if (require.main === module) bootstrap().then((id) => console.log('root user ' + id)).catch((e) => { console.error(e.message); process.exit(1); });
