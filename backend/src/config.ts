import { z } from 'zod';

/** همهٔ تنظیمات محیطی در شروع بررسی می‌شوند؛ اگر چیزی کم یا نادرست باشد سرور اصلاً بالا نمی‌آید (نه اینکه نیمه‌کاره کار کند). */
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL باید نشانی postgres باشد'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('true'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).default(300),
});
export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env);
  if (!r.success) throw new Error('تنظیمات سرور نامعتبر است: ' + r.error.issues.map((i) => i.path.join('.') + ' — ' + i.message).join('؛ '));
  const c = r.data;
  if (c.NODE_ENV === 'production') {
    if (!c.CORS_ORIGINS.trim()) throw new Error('در حالت production باید CORS_ORIGINS (دامنهٔ سایت) تعیین شود');
    if (c.CORS_ORIGINS.split(',').some((o) => !/^https:\/\//.test(o.trim()))) throw new Error('در production فقط دامنهٔ https مجاز است');
  }
  return c;
}
