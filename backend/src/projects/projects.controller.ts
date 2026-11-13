import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { AuthUser, CurrentUser, parse, Require } from '../common/http';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';

const uuid = z.string().uuid();

/** پروژه، طرف‌ها، چارت (سمت‌ها)، عضویت‌ها و گروه‌ها */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly db: Db, private readonly audit: AuditService, private readonly auth: AuthService) {}

  /** پروژه‌های من (کاربر صفر: همه) */
  @Get()
  async mine(@CurrentUser() u: AuthUser) {
    if (u.isRoot) return this.db.q('select * from projects order by created_at desc');
    return this.db.q(`select p.*, m.status as membership from projects p join memberships m on m.project_id = p.id where m.user_id = $1 and m.status <> 'left' order by p.created_at desc`, [u.id]);
  }

  /** ساختن پروژه: فقط کاربر صفر (یا هر کس که در تنظیمات سراسری اجازه داده شود — مرحلهٔ بعد) */
  @Post()
  async create(@Body() body: unknown, @CurrentUser() u: AuthUser) {
    if (!u.isRoot) throw new ForbiddenException('ساختن پروژه فقط با ادمین اصلی');
    const b = parse(z.object({ name: z.string().min(1), code: z.string().optional(), use_type: z.string().optional(), phase: z.string().optional(), info: z.record(z.string(), z.unknown()).optional() }), body);
    const p = await this.db.one(`insert into projects (name, code, use_type, phase, info, created_by) values ($1,$2,$3,$4,$5,$6) returning *`,
      [b.name, b.code ?? null, b.use_type ?? null, b.phase ?? null, JSON.stringify(b.info ?? {}), u.id]);
    await this.db.q(`insert into memberships (project_id, user_id, level, status) values ($1,$2,1,'active')`, [p.id, u.id]);
    await this.audit.log(u.id, p.id, 'create', 'project', p.id, b);
    return p;
  }

  @Get(':pid') @Require('project.read')
  async get(@Param('pid') pid: string) {
    const p = await this.db.one('select * from projects where id = $1', [pid]);
    if (!p) throw new NotFoundException();
    return p;
  }

  @Patch(':pid') @Require('project.manage')
  async update(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ name: z.string().min(1).optional(), code: z.string().nullable().optional(), use_type: z.string().nullable().optional(), phase: z.string().nullable().optional(), status: z.string().optional(), info: z.record(z.string(), z.unknown()).optional() }), body);
    const p = await this.db.one(`update projects set name = coalesce($2, name), code = coalesce($3, code), use_type = coalesce($4, use_type), phase = coalesce($5, phase), status = coalesce($6, status), info = coalesce($7, info) where id = $1 returning *`,
      [pid, b.name ?? null, b.code ?? null, b.use_type ?? null, b.phase ?? null, b.status ?? null, b.info ? JSON.stringify(b.info) : null]);
    await this.audit.log(u.id, pid, 'update', 'project', pid, b);
    return p;
  }

  // ---------- طرف‌ها ----------
  @Get(':pid/party-kinds') @Require('project.read')
  kinds() { return this.db.q('select * from party_kinds order by sort'); }

  @Get(':pid/parties') @Require('people.read')
  parties(@Param('pid') pid: string) { return this.db.q('select * from parties where project_id = $1 order by kind, name', [pid]); }

  @Post(':pid/parties') @Require('parties.manage')
  async addParty(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ kind: z.string(), name: z.string().min(1), disciplines: z.array(z.string()).optional(), info: z.record(z.string(), z.unknown()).optional() }), body);
    const r = await this.db.one('insert into parties (project_id, kind, name, disciplines, info) values ($1,$2,$3,$4,$5) returning *', [pid, b.kind, b.name, b.disciplines ?? [], JSON.stringify(b.info ?? {})]);
    await this.audit.log(u.id, pid, 'create', 'party', r.id, b);
    return r;
  }

  @Patch(':pid/parties/:id') @Require('parties.manage')
  async editParty(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ kind: z.string().optional(), name: z.string().min(1).optional(), disciplines: z.array(z.string()).optional(), info: z.record(z.string(), z.unknown()).optional() }), body);
    const r = await this.db.one(`update parties set kind = coalesce($3, kind), name = coalesce($4, name), disciplines = coalesce($5, disciplines), info = coalesce($6, info) where id = $2 and project_id = $1 returning *`,
      [pid, id, b.kind ?? null, b.name ?? null, b.disciplines ?? null, b.info ? JSON.stringify(b.info) : null]);
    await this.audit.log(u.id, pid, 'update', 'party', id, b);
    return r;
  }

  @Delete(':pid/parties/:id') @Require('parties.manage')
  async delParty(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.db.q('delete from parties where id = $2 and project_id = $1', [pid, id]);
    await this.audit.log(u.id, pid, 'delete', 'party', id);
    return { ok: true };
  }

  // ---------- چارت سازمانی ----------
  @Get(':pid/positions') @Require('people.read')
  positions(@Param('pid') pid: string) { return this.db.q('select * from positions where project_id = $1 order by sort, title', [pid]); }

  @Post(':pid/positions') @Require('chart.manage')
  async addPosition(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ title: z.string().min(1), parent_id: uuid.nullable().optional(), party_id: uuid.nullable().optional(), disciplines: z.array(z.string()).optional(), sort: z.number().int().optional(), approved: z.boolean().optional() }), body);
    const r = await this.db.one('insert into positions (project_id, title, parent_id, party_id, disciplines, sort, approved) values ($1,$2,$3,$4,$5,$6,$7) returning *',
      [pid, b.title, b.parent_id ?? null, b.party_id ?? null, b.disciplines ?? [], b.sort ?? 0, b.approved ?? false]);
    await this.audit.log(u.id, pid, 'create', 'position', r.id, b);
    return r;
  }

  @Patch(':pid/positions/:id') @Require('chart.manage')
  async editPosition(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ title: z.string().min(1).optional(), parent_id: uuid.nullable().optional(), party_id: uuid.nullable().optional(), disciplines: z.array(z.string()).optional(), sort: z.number().int().optional(), approved: z.boolean().optional() }), body);
    if (b.parent_id === id) throw new ForbiddenException('سمت نمی‌تواند زیر خودش باشد');
    const r = await this.db.one(`update positions set title = coalesce($3, title), parent_id = case when $4::boolean then $5::uuid else parent_id end,
        party_id = case when $6::boolean then $7::uuid else party_id end, disciplines = coalesce($8, disciplines), sort = coalesce($9, sort), approved = coalesce($10, approved)
        where id = $2 and project_id = $1 returning *`,
      [pid, id, b.title ?? null, 'parent_id' in b, b.parent_id ?? null, 'party_id' in b, b.party_id ?? null, b.disciplines ?? null, b.sort ?? null, b.approved ?? null]);
    await this.audit.log(u.id, pid, 'update', 'position', id, b);
    return r;
  }

  @Delete(':pid/positions/:id') @Require('chart.manage')
  async delPosition(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.db.q('delete from positions where id = $2 and project_id = $1', [pid, id]);
    await this.audit.log(u.id, pid, 'delete', 'position', id);
    return { ok: true };
  }

  // ---------- افراد و عضویت ----------
  @Get(':pid/members') @Require('people.read')
  members(@Param('pid') pid: string) {
    return this.db.q(`select m.*, u.username, u.display_name, u.phone, u.email, p.title as position_title, pa.name as party_name, pa.kind as party_kind
        from memberships m join users u on u.id = m.user_id left join positions p on p.id = m.position_id left join parties pa on pa.id = m.party_id
       where m.project_id = $1 order by u.display_name`, [pid]);
  }

  /** افزودن نفر: اگر کاربر نیست ساخته می‌شود (بی‌رمز، منتظر فعال‌سازی) و با سمت و طرفش عضو پروژه می‌شود */
  @Post(':pid/members') @Require('people.manage')
  async addMember(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ username: z.string().min(2), display_name: z.string().min(1), phone: z.string().optional(), email: z.string().optional(),
      position_id: uuid.nullable().optional(), party_id: uuid.nullable().optional(), level: z.number().int().min(1).max(9).nullable().optional(), status: z.enum(['invited', 'active']).optional() }), body);
    return this.db.tx(async (c) => {
      let usr = (await c.query('select id from users where lower(username) = lower($1)', [b.username])).rows[0];
      if (!usr) usr = (await c.query(`insert into users (username, display_name, phone, email, status) values ($1,$2,$3,$4,'pending') returning id`, [b.username, b.display_name, b.phone ?? null, b.email ?? null])).rows[0];
      const m = (await c.query(`insert into memberships (project_id, user_id, position_id, party_id, level, status) values ($1,$2,$3,$4,$5,$6)
          on conflict (project_id, user_id) do update set position_id = excluded.position_id, party_id = excluded.party_id, level = excluded.level, status = excluded.status returning *`,
        [pid, usr.id, b.position_id ?? null, b.party_id ?? null, b.level ?? null, b.status ?? 'invited'])).rows[0];
      await c.query('insert into audit_log (actor_id, project_id, action, entity, entity_id, data) values ($1,$2,$3,$4,$5,$6)', [u.id, pid, 'upsert', 'membership', m.id, JSON.stringify(b)]);
      return m;
    });
  }

  @Patch(':pid/members/:id') @Require('people.manage')
  async editMember(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ position_id: uuid.nullable().optional(), party_id: uuid.nullable().optional(), level: z.number().int().min(1).max(9).nullable().optional(), status: z.enum(['invited', 'active', 'left']).optional() }), body);
    const tgt = await this.db.one<{ is_root: boolean; user_id: string }>('select u.is_root, m.user_id from memberships m join users u on u.id = m.user_id where m.id = $1 and m.project_id = $2', [id, pid]);
    if (!tgt) throw new NotFoundException();
    if (tgt.is_root && !u.isRoot) throw new ForbiddenException('ادمین اصلی را فقط خودش تغییر می‌دهد');
    const r = await this.db.one(`update memberships set position_id = case when $3::boolean then $4::uuid else position_id end, party_id = case when $5::boolean then $6::uuid else party_id end,
        level = case when $7::boolean then $8::smallint else level end, status = coalesce($9, status) where id = $1 and project_id = $2 returning *`,
      [id, pid, 'position_id' in b, b.position_id ?? null, 'party_id' in b, b.party_id ?? null, 'level' in b, b.level ?? null, b.status ?? null]);
    await this.audit.log(u.id, pid, 'update', 'membership', id, b);
    return r;
  }

  /** لینک فعال‌سازی یک‌بارمصرف برای یک عضو (ادمین می‌فرستد؛ خود توکن جایی ذخیره نمی‌شود) */
  @Post(':pid/members/:id/invite') @Require('people.manage')
  async invite(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    const m = await this.db.one<{ user_id: string; is_root: boolean }>('select m.user_id, us.is_root from memberships m join users us on us.id = m.user_id where m.id = $1 and m.project_id = $2', [id, pid]);
    if (!m) throw new NotFoundException();
    if (m.is_root && !u.isRoot) throw new ForbiddenException('ادمین اصلی را فقط خودش تغییر می‌دهد');
    const token = await this.auth.createInvite(m.user_id, u.id);
    await this.audit.log(u.id, pid, 'invite', 'user', m.user_id);
    return { token };
  }

  // ---------- گروه‌ها ----------
  @Get(':pid/groups') @Require('people.read')
  groups(@Param('pid') pid: string) {
    return this.db.q(`select g.*, coalesce(array_agg(gm.user_id) filter (where gm.user_id is not null), '{}') as members from groups g left join group_members gm on gm.group_id = g.id where g.project_id = $1 group by g.id order by g.name`, [pid]);
  }

  @Post(':pid/groups') @Require('groups.manage')
  async addGroup(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ name: z.string().min(1), description: z.string().optional(), members: z.array(uuid).optional() }), body);
    return this.db.tx(async (c) => {
      const g = (await c.query('insert into groups (project_id, name, description) values ($1,$2,$3) returning *', [pid, b.name, b.description ?? null])).rows[0];
      for (const m of b.members ?? []) await c.query('insert into group_members (group_id, user_id) values ($1,$2) on conflict do nothing', [g.id, m]);
      await c.query('insert into audit_log (actor_id, project_id, action, entity, entity_id, data) values ($1,$2,$3,$4,$5,$6)', [u.id, pid, 'create', 'group', g.id, JSON.stringify(b)]);
      return g;
    });
  }

  @Patch(':pid/groups/:id') @Require('groups.manage')
  async editGroup(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ name: z.string().min(1).optional(), description: z.string().optional(), members: z.array(uuid).optional() }), body);
    return this.db.tx(async (c) => {
      const g = (await c.query('update groups set name = coalesce($3, name), description = coalesce($4, description) where id = $2 and project_id = $1 returning *', [pid, id, b.name ?? null, b.description ?? null])).rows[0];
      if (!g) throw new NotFoundException();
      if (b.members) { await c.query('delete from group_members where group_id = $1', [id]); for (const m of b.members) await c.query('insert into group_members (group_id, user_id) values ($1,$2)', [id, m]); }
      await c.query('insert into audit_log (actor_id, project_id, action, entity, entity_id, data) values ($1,$2,$3,$4,$5,$6)', [u.id, pid, 'update', 'group', id, JSON.stringify(b)]);
      return g;
    });
  }

  @Delete(':pid/groups/:id') @Require('groups.manage')
  async delGroup(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser) {
    await this.db.q('delete from groups where id = $2 and project_id = $1', [pid, id]);
    await this.audit.log(u.id, pid, 'delete', 'group', id);
    return { ok: true };
  }
}
