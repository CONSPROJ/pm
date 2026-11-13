import { Body, Controller, Delete, ForbiddenException, Get, Param, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { AuthzService } from '../authz/authz.service';
import { AuthUser, CurrentUser, parse, Require } from '../common/http';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

/**
 * مرکز دسترسی: کاتالوگ همهٔ اجازه‌های سامانه، ماتریس «اجازه × موضوع» (سطح، سمت، گروه، نوع طرف، طرف، فرد)،
 * اعطا و سلب، و توضیح اینکه یک نفر هر اجازه را از کجا دارد.
 */
@Controller('projects/:pid/access')
export class AccessController {
  constructor(private readonly db: Db, private readonly authz: AuthzService, private readonly audit: AuditService, private readonly settings: SettingsService) {}

  /** اجازه‌های خودم (رابط کاربری از این می‌فهمد چه چیزی را نشان دهد) */
  @Get('me') @Require('project.read')
  me(@Param('pid') pid: string, @CurrentUser() u: AuthUser) { return this.authz.effective(u.id, pid); }

  @Get('catalog') @Require('access.manage')
  catalog() { return this.db.q('select * from capabilities order by module, key'); }

  /** ماتریس کامل برای صفحهٔ مدیریت دسترسی */
  @Get('matrix') @Require('access.manage')
  async matrix(@Param('pid') pid: string) {
    const [caps, grants, positions, groups, parties, kinds, members] = await Promise.all([
      this.db.q('select * from capabilities order by module, key'),
      this.db.q('select * from grants where project_id = $1 or project_id is null order by created_at', [pid]),
      this.db.q('select id, title, parent_id, party_id, disciplines from positions where project_id = $1 order by sort, title', [pid]),
      this.db.q('select id, name from groups where project_id = $1 order by name', [pid]),
      this.db.q('select id, name, kind from parties where project_id = $1 order by kind, name', [pid]),
      this.db.q('select code, title from party_kinds order by sort'),
      this.db.q(`select u.id, u.display_name, m.level from memberships m join users u on u.id = m.user_id where m.project_id = $1 order by u.display_name`, [pid]),
    ]);
    const levels = (await this.settings.value(pid, 'levels.names')) as Record<string, string>;
    return { capabilities: caps, grants, subjects: { level: Object.entries(levels || {}).map(([id, name]) => ({ id, name })), position: positions, group: groups, party_kind: kinds.map((k: any) => ({ id: k.code, name: k.title })), party: parties, user: members } };
  }

  /** اعطا یا منع یک اجازه به یک موضوع (با محدودیت اختیاری) */
  @Put('grants') @Require('access.manage')
  async upsert(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({
      subject_type: z.enum(['level', 'position', 'group', 'party_kind', 'party', 'user']), subject_id: z.string().min(1),
      capability_key: z.string().min(1), effect: z.enum(['allow', 'deny']), constraints: z.record(z.union([z.array(z.string()), z.boolean()])).optional(),
      all_projects: z.boolean().optional(),
    }), body);
    if (b.all_projects && !u.isRoot) throw new ForbiddenException('اعطای سراسری فقط با ادمین اصلی');
    if (b.subject_type === 'user') {
      const t = await this.db.one<{ is_root: boolean }>('select is_root from users where id::text = $1', [b.subject_id]);
      if (t?.is_root) throw new ForbiddenException('ادمین اصلی همیشه همهٔ دسترسی‌ها را دارد');
    }
    const cap = await this.db.one<{ constraint_keys: string[] }>('select constraint_keys from capabilities where key = $1', [b.capability_key]);
    if (!cap) throw new ForbiddenException('چنین اجازه‌ای تعریف نشده');
    const bad = Object.keys(b.constraints || {}).filter((k) => !cap.constraint_keys.includes(k));
    if (bad.length) throw new ForbiddenException('این اجازه محدودیت «' + bad.join('، ') + '» نمی‌پذیرد');
    const r = await this.db.one(
      `insert into grants (project_id, subject_type, subject_id, capability_key, effect, constraints, created_by) values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_type, subject_id, capability_key)
       do update set effect = excluded.effect, constraints = excluded.constraints, created_by = excluded.created_by, created_at = now() returning *`,
      [b.all_projects ? null : pid, b.subject_type, b.subject_id, b.capability_key, b.effect, JSON.stringify(b.constraints || {}), u.id]);
    await this.audit.log(u.id, pid, 'grant', 'access', r.id, b);
    return r;
  }

  /** برداشتن یک اعطا (برگشت به لایهٔ عام‌تر یا پیش‌فرض) */
  @Delete('grants/:id') @Require('access.manage')
  async remove(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    const g = await this.db.one('delete from grants where id = $1 and (project_id = $2 or ($3::boolean and project_id is null)) returning *', [id, pid, u.isRoot]);
    await this.audit.log(u.id, pid, 'revoke', 'access', id, g || {});
    return { ok: !!g };
  }

  /** «این نفر چه اجازه‌هایی دارد و از کجا؟» */
  @Get('explain') @Require('access.manage')
  explain(@Param('pid') pid: string, @Query('user') user: string) { return this.authz.effective(user, pid); }
}
