import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

/** خطاها به کاربر پیام روشن و بی‌جزئیات داخلی می‌دهند؛ جزئیات فقط در لاگ سرور */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly log = new Logger('errors');
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) { res.status(e.getStatus()).send(e.getResponse()); return; }
    const code = (e as { code?: string })?.code;
    if (code === '23505') { res.status(409).send({ statusCode: 409, message: 'این مورد قبلاً ثبت شده (تکراری)' }); return; }
    if (code === '23503') { res.status(400).send({ statusCode: 400, message: 'به موردی ارجاع داده شده که وجود ندارد' }); return; }
    if (code === '22P02' || code === '22007' || code === '22008') { res.status(400).send({ statusCode: 400, message: 'قالب داده نامعتبر است' }); return; }
    this.log.error((e as Error)?.stack || String(e));
    res.status(500).send({ statusCode: 500, message: 'خطای داخلی سرور' });
  }
}
