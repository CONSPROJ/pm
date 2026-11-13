import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthzService } from '../authz/authz.service';
import { PUBLIC, REQUIRE } from '../common/http';

/** هر درخواست: اول شناسایی (توکن)، بعد اجازهٔ لازم همان مسیر در همان پروژه — همه در سرور */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly authz: AuthzService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const h = String(req.headers['authorization'] || '');
    const user = await this.auth.resolve(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!user) throw new UnauthorizedException('ابتدا وارد شوید');
    req.user = user;
    const cap = this.reflector.getAllAndOverride<string>(REQUIRE, [ctx.getHandler(), ctx.getClass()]);
    if (!cap) return true;
    const pid = (req.params && req.params.pid) || null;
    const d = await this.authz.decide(user.id, pid, cap);
    if (!d.allowed) throw new ForbiddenException({ message: 'اجازهٔ این کار را ندارید', capability: cap, source: d.source });
    req.grant = d.constraints;
    return true;
  }
}
