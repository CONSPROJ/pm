import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { ErrorsFilter } from './common/errors.filter';

export async function createApp() {
  const cfg = loadConfig();
  const adapter = new FastifyAdapter({
    trustProxy: cfg.TRUST_PROXY === 'true', bodyLimit: 5 * 1024 * 1024,
    logger: cfg.NODE_ENV === 'production' ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] } : false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { logger: ['error', 'warn'] });
  /* سرآیندهای امنیتی (API محتوای HTML نمی‌دهد: CSP سخت‌گیر) */
  await app.register(helmet as any, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } });
  /* محدودیت تعداد درخواست برای هر IP (در کنار قفل حساب پس از ورود ناموفق) */
  await app.register(rateLimit as any, { max: cfg.RATE_LIMIT_PER_MIN, timeWindow: '1 minute' });
  app.useGlobalFilters(new ErrorsFilter());
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: cfg.CORS_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean), credentials: false, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  app.enableShutdownHooks();
  return app;
}

if (require.main === module) {
  createApp().then(async (app) => { await app.listen(loadConfig().PORT, '0.0.0.0'); console.log('pm-backend listening'); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
