import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Db } from '../db/db.service';
import { AuthUser } from '../common/http';
import { SettingsService } from '../settings/settings.service';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
/* برای نام کاربری ناموجود هم همان زمان مقایسهٔ رمز صرف می‌شود تا از زمان پاسخ نشود فهمید کاربر هست یا نه */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 11);
const BAD_LOGIN = 'نام کاربری یا رمز نادرست است، یا حساب موقتاً قفل شده';

@Injectable()
export class AuthService {
  constructor(private readonly db: Db, private readonly settings: SettingsService) {}

  async hash(pw: string) { return bcrypt.hash(pw, 11); }

  /** سیاست رمز: کمترین طول از قوانین، دست‌کم یک حرف و یک رقم، نه برابر نام کاربری */
  async checkPassword(pw: string, username: string) {
    const min = Number(await this.settings.value(null, 'security.password_min')) || 8;
    if (pw.length < min) throw new BadRequestException('رمز باید دست‌کم ' + min + ' نویسه باشد');
    if (!/[A-Za-z؀-ۿ]/.test(pw) || !/\d|[۰-۹]/.test(pw)) throw new BadRequestException('رمز باید هم حرف و هم عدد داشته باشد');
    if (pw.toLowerCase() === username.toLowerCase()) throw new BadRequestException('رمز نباید با نام کاربری یکی باشد');
  }

  /** ورود با قفل حساب پس از تلاش‌های ناموفق؛ نشست تازه با توکن تصادفی (فقط هش آن ذخیره می‌شود) */
  async login(username: string, password: string, ua?: string, ip?: string) {
    const u = await this.db.one<{ id: string; password_hash: string | null; status: string; locked_until: Date | null }>(
      'select id, password_hash, status, locked_until from users where lower(username) = lower($1)', [username]);
    const ok = await bcrypt.compare(password, u?.password_hash || DUMMY_HASH);
    if (!u || u.status !== 'active' || !u.password_hash) throw new UnauthorizedException(BAD_LOGIN);
    if (u.locked_until && new Date(u.locked_until) > new Date()) throw new UnauthorizedException(BAD_LOGIN);
    if (!ok) {
      const max = Number(await this.settings.value(null, 'security.max_failed_logins')) || 5;
      const mins = Number(await this.settings.value(null, 'security.lockout_minutes')) || 15;
      await this.db.q(`update users set
          locked_until = case when failed_count + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end,
          failed_count = case when failed_count + 1 >= $2 then 0 else failed_count + 1 end where id = $1`, [u.id, max, String(mins)]);
      throw new UnauthorizedException(BAD_LOGIN);
    }
    await this.db.q('update users set failed_count = 0, locked_until = null where id = $1', [u.id]);
    return { token: await this.newSession(u.id, ua, ip), userId: u.id };
  }

  private async newSession(userId: string, ua?: string, ip?: string) {
    const days = Number(await this.settings.value(null, 'security.session_days')) || 30;
    const token = randomBytes(32).toString('base64url');
    await this.db.q(`insert into sessions (user_id, token_hash, user_agent, ip, expires_at) values ($1,$2,$3,$4, now() + ($5 || ' days')::interval)`, [userId, sha(token), ua ?? null, ip ?? null, String(days)]);
    return token;
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

  /** لینک فعال‌سازی یک‌بارمصرف (برای نفری که ادمین اضافه کرده یا رمزش را فراموش کرده) */
  async createInvite(userId: string, by: string) {
    const days = Number(await this.settings.value(null, 'security.invite_days')) || 7;
    const token = randomBytes(24).toString('base64url');
    await this.db.q('update user_invites set used_at = now() where user_id = $1 and used_at is null', [userId]);   // لینک‌های قبلی باطل
    await this.db.q(`insert into user_invites (user_id, token_hash, created_by, expires_at) values ($1,$2,$3, now() + ($4 || ' days')::interval)`, [userId, sha(token), by, String(days)]);
    return token;
  }

  /** فعال‌سازی با لینک: رمز تازه، حساب فعال، همهٔ نشست‌های قبلی باطل */
  async activate(token: string, password: string, ua?: string, ip?: string) {
    return this.db.tx(async (c) => {
      const inv = (await c.query(`select i.id, i.user_id, u.username from user_invites i join users u on u.id = i.user_id
          where i.token_hash = $1 and i.used_at is null and i.expires_at > now() and u.status <> 'disabled' for update`, [sha(token)])).rows[0];
      if (!inv) throw new BadRequestException('لینک فعال‌سازی نامعتبر یا منقضی است');
      await this.checkPassword(password, inv.username);
      await c.query(`update users set password_hash = $2, status = 'active', failed_count = 0, locked_until = null, password_changed_at = now() where id = $1`, [inv.user_id, await this.hash(password)]);
      await c.query('update user_invites set used_at = now() where id = $1', [inv.id]);
      await c.query('delete from sessions where user_id = $1', [inv.user_id]);
      return inv.user_id as string;
    }).then(async (uid) => ({ userId: uid, token: await this.newSession(uid, ua, ip) }));
  }

  /** تغییر رمز با رمز فعلی؛ نشست‌های دیگر باطل می‌شوند */
  async changePassword(user: AuthUser, current: string, next: string) {
    const u = await this.db.one<{ password_hash: string }>('select password_hash from users where id = $1', [user.id]);
    if (!u || !(await bcrypt.compare(current, u.password_hash || DUMMY_HASH))) throw new BadRequestException('رمز فعلی نادرست است');
    await this.checkPassword(next, user.username);
    await this.db.q('update users set password_hash = $2, password_changed_at = now() where id = $1', [user.id, await this.hash(next)]);
    await this.db.q('delete from sessions where user_id = $1 and id <> $2', [user.id, user.sessionId]);
  }
}
