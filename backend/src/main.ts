import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true, bodyLimit: 5 * 1024 * 1024 }), { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  /* فقط دامنه‌های خود سایت (از تنظیم سرور) */
  app.enableCors({ origin: (process.env.CORS_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean), credentials: false });
  return app;
}

if (require.main === module) {
  createApp().then((app) => app.listen(Number(process.env.PORT || 3100), '0.0.0.0')).then(() => console.log('pm-backend listening'));
}
