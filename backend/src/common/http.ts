import { BadRequestException, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ZodSchema } from 'zod';

export interface AuthUser { id: string; username: string; displayName: string; isRoot: boolean; sessionId: string; }

/** اجازهٔ لازم برای این مسیر؛ پروژه از پارامتر :pid خوانده می‌شود */
export const REQUIRE = 'pm:require';
export const Require = (capability: string) => SetMetadata(REQUIRE, capability);
export const PUBLIC = 'pm:public';
export const Public = () => SetMetadata(PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
/** محدودیت‌های اجازهٔ همین مسیر (مثلاً رشته‌های مجاز) که گارد پیدا کرده */
export const Grant = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().grant || {});

export function parse<T>(schema: ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ message: 'ورودی نامعتبر', issues: r.error.issues });
  return r.data;
}
