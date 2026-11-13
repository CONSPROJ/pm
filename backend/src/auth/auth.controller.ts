import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, parse, Public } from '../common/http';
import { AuditService } from '../audit/audit.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly audit: AuditService) {}

  @Public() @Post('login')
  async login(@Body() body: unknown, @Req() req: any) {
    const b = parse(z.object({ username: z.string().min(1), password: z.string().min(1) }), body);
    try {
      const r = await this.auth.login(b.username, b.password, req.headers['user-agent'], req.ip);
      await this.audit.log(r.userId, null, 'login', 'session', null, {}, req.ip);
      return { token: r.token };
    } catch (e) {
      await this.audit.log(null, null, 'login_fail', 'session', null, { username: b.username }, req.ip);
      throw e;
    }
  }

  @Get('me')
  me(@CurrentUser() u: AuthUser) { return { id: u.id, username: u.username, displayName: u.displayName, isRoot: u.isRoot }; }

  @Post('logout')
  async logout(@CurrentUser() u: AuthUser) { await this.auth.logout(u.sessionId); return { ok: true }; }
}
