import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Db } from '../db/db.service';
import { AuthUser } from '../common/http';
import { SettingsService } from '../settings/settings.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(private readonly db: Db, private readonly settings: SettingsService) {}

  async hash(pw: string) { return bcrypt.hash(pw, 11); }

  /** ورود: نشست تازه با توکن تصادفی؛ فقط هش توکن در پایگاه داده می‌ماند */
  async login(username: string, password: string, ua?: string, ip?: string) {
    const u = await this.db.one<{ id: string; password_hash: string | null; status: string }>('select id, password_hash, status from users where lower(username) = lower($1)', [username]);
    if (!u || u.status !== 'active' || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) throw new UnauthorizedException('نام کاربری یا رمز نادرست است');
    const days = Number(await this.settings.value(null, 'security.session_days')) || 30;
    const token = randomBytes(32).toString('base64url');
    await this.db.q(`insert into sessions (user_id, token_hash, user_agent, ip, expires_at) values ($1,$2,$3,$4, now() + ($5 || ' days')::interval)`, [u.id, sha(token), ua ?? null, ip ?? null, String(days)]);
    return { token, userId: u.id };
  }

  async resolve(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    const r = await this.db.one<{ sid: string; id: string; username: string; display_name: string; is_root: boolean }>(
      `select s.id as sid, u.id, u.username, u.display_name, u.is_root from sessions s join users u on u.id = s.user_id
        where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`, [sha(token)]);
    if (!r) return null;
    await this.db.q('update sessions set last_seen = now() where id = $1', [r.sid]);
    return { id: r.id, username: r.username, displayName: r.display_name, isRoot: r.is_root, sessionId: r.sid };
  }

  async logout(sessionId: string) { await this.db.q('delete from sessions where id = $1', [sessionId]); }
}
