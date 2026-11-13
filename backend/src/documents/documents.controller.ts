import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db/db.service';
import { AuthzService, Constraints } from '../authz/authz.service';
import { AuthUser, CurrentUser, Grant, parse, Require } from '../common/http';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

const uuid = z.string().uuid();
const DAY = 86400000;
const days = (a?: string | Date | null, b?: string | Date | null) => (a && b) ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY)) : null;

/**
 * کنترل مدارک: رشته‌ها، انواع سند و گردش‌کارها (همه قابل تعریف برای هر پروژه)،
 * مدارک و ویرایش‌ها، تغییر وضعیت طبق گذارهای مجاز، ترنسمیتال و MDR.
 * دسترسی و محدودیت (نوع سند، رشته، فقط مدارک طرف خود) در سرور روی خود کوئری اعمال می‌شود.
 */
@Controller('projects/:pid')
export class DocumentsController {
  constructor(private readonly db: Db, private readonly authz: AuthzService, private readonly audit: AuditService, private readonly settings: SettingsService) {}

  // ================= پیکربندی =================
  @Get('doc-config') @Require('project.read')
  async config(@Param('pid') pid: string) {
    const [disciplines, types, workflows, states, transitions] = await Promise.all([
      this.db.q('select * from disciplines where project_id = $1 order by sort, code', [pid]),
      this.db.q('select * from doc_types where project_id = $1 order by code', [pid]),
      this.db.q('select * from workflows where project_id = $1 order by name', [pid]),
      this.db.q('select s.* from workflow_states s join workflows w on w.id = s.workflow_id where w.project_id = $1 order by s.sort', [pid]),
      this.db.q('select t.* from workflow_transitions t join workflows w on w.id = t.workflow_id where w.project_id = $1', [pid]),
    ]);
    return { disciplines, types, workflows, states, transitions };
  }

  @Put('disciplines') @Require('doc.config')
  async putDisciplines(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.array(z.object({ code: z.string().min(1), name: z.string().min(1), sort: z.number().int().optional() })), body);
    await this.db.tx(async (c) => { for (const [i, d] of b.entries()) await c.query(`insert into disciplines (project_id, code, name, sort) values ($1,$2,$3,$4) on conflict (project_id, code) do update set name = excluded.name, sort = excluded.sort`, [pid, d.code, d.name, d.sort ?? i]); });
    await this.audit.log(u.id, pid, 'set', 'disciplines', null, b);
    return this.db.q('select * from disciplines where project_id = $1 order by sort', [pid]);
  }

  /** یک گردش‌کار کامل: وضعیت‌ها و گذارهای مجاز (با اجازهٔ لازم هر گذار) */
  @Put('workflows') @Require('doc.config')
  async putWorkflow(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({
      name: z.string().min(1),
      states: z.array(z.object({ code: z.string().min(1), name: z.string().min(1), category: z.enum(['draft', 'in_review', 'returned', 'approved', 'closed', 'void']), review_code: z.string().nullable().optional(), holder_kind: z.string().nullable().optional(), limit_days: z.number().int().nullable().optional() })).min(1),
      transitions: z.array(z.object({ from: z.string().nullable(), to: z.string(), capability: z.string().nullable().optional() })),
    }), body);
    const wf = await this.db.tx(async (c) => {
      const w = (await c.query('insert into workflows (project_id, name) values ($1,$2) on conflict (project_id, name) do update set name = excluded.name returning *', [pid, b.name])).rows[0];
      const ids: Record<string, string> = {};
      for (const [i, s] of b.states.entries()) {
        const r = (await c.query(`insert into workflow_states (workflow_id, code, name, category, review_code, holder_kind, limit_days, sort) values ($1,$2,$3,$4,$5,$6,$7,$8)
            on conflict (workflow_id, code) do update set name = excluded.name, category = excluded.category, review_code = excluded.review_code, holder_kind = excluded.holder_kind, limit_days = excluded.limit_days, sort = excluded.sort returning id`,
          [w.id, s.code, s.name, s.category, s.review_code ?? null, s.holder_kind ?? null, s.limit_days ?? null, i])).rows[0];
        ids[s.code] = r.id;
      }
      await c.query('delete from workflow_transitions where workflow_id = $1', [w.id]);
      for (const t of b.transitions) {
        if (!ids[t.to] || (t.from && !ids[t.from])) throw new BadRequestException('گذار به وضعیت تعریف‌نشده: ' + (t.from || '∅') + ' → ' + t.to);
        await c.query('insert into workflow_transitions (workflow_id, from_state, to_state, capability_key) values ($1,$2,$3,$4)', [w.id, t.from ? ids[t.from] : null, ids[t.to], t.capability ?? null]);
      }
      return w;
    });
    await this.audit.log(u.id, pid, 'set', 'workflow', wf.id, b);
    return wf;
  }

  @Put('doc-types') @Require('doc.config')
  async putTypes(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.array(z.object({ code: z.string().min(1), name: z.string().min(1), workflow: z.string().nullable().optional(), numbering: z.string().nullable().optional(), in_mdr: z.boolean().optional() })), body);
    await this.db.tx(async (c) => {
      for (const t of b) {
        const wf = t.workflow ? (await c.query('select id from workflows where project_id = $1 and name = $2', [pid, t.workflow])).rows[0] : null;
        if (t.workflow && !wf) throw new BadRequestException('گردش‌کار «' + t.workflow + '» تعریف نشده');
        await c.query(`insert into doc_types (project_id, code, name, workflow_id, numbering, in_mdr) values ($1,$2,$3,$4,$5,$6)
            on conflict (project_id, code) do update set name = excluded.name, workflow_id = excluded.workflow_id, numbering = excluded.numbering, in_mdr = excluded.in_mdr`,
          [pid, t.code, t.name, wf ? wf.id : null, t.numbering ?? null, t.in_mdr ?? true]);
      }
    });
    await this.audit.log(u.id, pid, 'set', 'doc_types', null, b);
    return this.db.q('select * from doc_types where project_id = $1 order by code', [pid]);
  }

  // ================= مدارک =================
  /** فیلتر سرور برای محدودیت‌های اجازه: نوع سند، رشته، فقط مدارک طرف خود */
  private async scope(pid: string, userId: string, g: Constraints, alias = 'd') {
    const where: string[] = []; const params: unknown[] = [];
    if (Array.isArray(g.doc_types)) { params.push(g.doc_types); where.push(`${alias}.type_id in (select id from doc_types where project_id = ${alias}.project_id and code = any($P))`); }
    if (Array.isArray(g.disciplines)) { params.push(g.disciplines); where.push(`${alias}.discipline_id in (select id from disciplines where project_id = ${alias}.project_id and code = any($P))`); }
    if (g.own_party === true) {
      const m = await this.db.one<{ party_id: string | null }>('select party_id from memberships where project_id = $1 and user_id = $2', [pid, userId]);
      params.push(m?.party_id ?? null); where.push(`${alias}.originator_id = $P`);
    }
    return { where, params };
  }

  @Get('documents') @Require('doc.read')
  async list(@Param('pid') pid: string, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const s = await this.scope(pid, u.id, g);
    let i = 1; const params: unknown[] = [pid];
    const cond = s.where.map((w, k) => { params.push(s.params[k]); return w.replace('$P', '$' + (++i)); });
    return this.db.q(`
      select d.*, t.code as type_code, t.name as type_name, di.code as discipline_code, di.name as discipline_name, pa.name as originator_name,
             st.name as state_name, st.category as state_category, st.review_code,
             (select json_build_object('rev', r.rev, 'seq', r.seq, 'received_at', r.received_at, 'closed_at', r.closed_at, 'review_code', r.review_code) from revisions r where r.document_id = d.id order by r.seq desc limit 1) as last_rev,
             (select min(r.received_at) from revisions r where r.document_id = d.id) as first_issue,
             (select count(*) from revisions r where r.document_id = d.id)::int as rev_count
        from documents d join doc_types t on t.id = d.type_id left join disciplines di on di.id = d.discipline_id
        left join parties pa on pa.id = d.originator_id left join workflow_states st on st.id = d.current_state_id
       where d.project_id = $1 ${cond.length ? 'and ' + cond.join(' and ') : ''}
       order by di.sort nulls last, d.number`, params);
  }

  @Post('documents') @Require('doc.create')
  async create(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const b = parse(z.object({ type: z.string(), number: z.string().min(1), title: z.string().min(1), discipline: z.string().nullable().optional(), originator_id: uuid.nullable().optional(),
      planned_issue: z.string().nullable().optional(), planned_approval: z.string().nullable().optional(), weight: z.number().positive().optional(), info: z.record(z.unknown()).optional() }), body);
    if (Array.isArray(g.doc_types) && !g.doc_types.includes(b.type)) throw new ForbiddenException('ثبت این نوع سند برای شما مجاز نیست');
    if (Array.isArray(g.disciplines) && b.discipline && !g.disciplines.includes(b.discipline)) throw new ForbiddenException('ثبت سند این رشته برای شما مجاز نیست');
    const t = await this.db.one<{ id: string }>('select id from doc_types where project_id = $1 and code = $2', [pid, b.type]);
    if (!t) throw new BadRequestException('نوع سند تعریف نشده');
    const di = b.discipline ? await this.db.one<{ id: string }>('select id from disciplines where project_id = $1 and code = $2', [pid, b.discipline]) : null;
    if (b.discipline && !di) throw new BadRequestException('رشته تعریف نشده');
    const d = await this.db.one(`insert into documents (project_id, type_id, number, title, discipline_id, originator_id, planned_issue, planned_approval, weight, info, created_by)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [pid, t.id, b.number, b.title, di?.id ?? null, b.originator_id ?? null, b.planned_issue ?? null, b.planned_approval ?? null, b.weight ?? 1, JSON.stringify(b.info ?? {}), u.id]);
    await this.audit.log(u.id, pid, 'create', 'document', d.id, b);
    return d;
  }

  /** یک مدرک با همهٔ ویرایش‌ها و رویدادها و تحلیل زمان: ماندن در هر وضعیت، نزد هر طرف، و فاصلهٔ اصلاح بین ویرایش‌ها */
  @Get('documents/:id') @Require('doc.read')
  async get(@Param('pid') pid: string, @Param('id') id: string, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const d = await this.visible(pid, id, u.id, g);
    const revs = await this.db.q(`select * from revisions where document_id = $1 order by seq`, [id]);
    const ev = await this.db.q(`select e.*, s.code as state_code, s.name as state_name, s.category, s.review_code, s.holder_kind, s.limit_days, us.display_name as by_name, pa.name as holder_name
        from revision_events e join workflow_states s on s.id = e.state_id left join users us on us.id = e.by_user left join parties pa on pa.id = e.holder_party
       where e.revision_id = any($1::uuid[]) order by e.at`, [revs.map((r: any) => r.id)]);
    const now = new Date();
    const out = revs.map((r: any, i: number) => {
      const E = ev.filter((e: any) => e.revision_id === r.id);
      const steps = E.map((e: any, k: number) => { const end = E[k + 1]?.at ?? (r.closed_at || (i === revs.length - 1 ? now : null)); const dd = days(e.at, end);
        return { ...e, days: dd, open: !E[k + 1] && !r.closed_at && i === revs.length - 1, over: e.limit_days != null && dd != null && dd > e.limit_days }; });
      const prev = revs[i - 1];
      return { ...r, steps, review_days: days(r.received_at, r.closed_at || (i === revs.length - 1 ? now : null)), resubmit_days: prev ? days(prev.closed_at, r.received_at) : null };
    });
    const byHolder: Record<string, number> = {};
    out.forEach((r: any) => r.steps.forEach((s: any) => { const k = s.holder_kind || 'نامشخص'; byHolder[k] = (byHolder[k] || 0) + (s.days || 0); }));
    return { document: d, revisions: out, summary: {
      total_days: revs.length ? days(revs[0].received_at, revs[revs.length - 1].closed_at || now) : null,
      review_days: out.reduce((t: number, r: any) => t + (r.review_days || 0), 0),
      resubmit_days: out.reduce((t: number, r: any) => t + (r.resubmit_days || 0), 0),
      days_by_holder: byHolder } };
  }

  private async visible(pid: string, id: string, userId: string, g: Constraints) {
    const s = await this.scope(pid, userId, g);
    let i = 2; const params: unknown[] = [pid, id];
    const cond = s.where.map((w, k) => { params.push(s.params[k]); return w.replace('$P', '$' + (++i)); });
    const d = await this.db.one(`select d.* from documents d where d.project_id = $1 and d.id = $2 ${cond.length ? 'and ' + cond.join(' and ') : ''}`, params);
    if (!d) throw new NotFoundException('مدرک پیدا نشد یا اجازهٔ دیدنش را ندارید');
    return d;
  }

  /** ویرایش تازه (دریافت Rev بعدی): وضعیت شروع همان گذارِ «از هیچ» در گردش‌کار نوع سند */
  @Post('documents/:id/revisions') @Require('doc.create')
  async addRevision(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const b = parse(z.object({ rev: z.string().min(1), received_at: z.string().optional(), files: z.array(z.unknown()).optional(), note: z.string().optional(), holder_party: uuid.nullable().optional() }), body);
    await this.visible(pid, id, u.id, g);
    const start = await this.db.one<{ id: string }>(`select tr.to_state as id from documents d join doc_types t on t.id = d.type_id join workflow_transitions tr on tr.workflow_id = t.workflow_id and tr.from_state is null where d.id = $1 limit 1`, [id]);
    if (!start) throw new BadRequestException('گردش‌کار این نوع سند وضعیت شروع ندارد');
    const r = await this.db.tx(async (c) => {
      const seq = (await c.query('select coalesce(max(seq), 0) + 1 as n from revisions where document_id = $1', [id])).rows[0].n;
      const rv = (await c.query(`insert into revisions (document_id, rev, seq, received_at, state_id, files, note, created_by) values ($1,$2,$3,coalesce($4::timestamptz, now()),$5,$6,$7,$8) returning *`,
        [id, b.rev, seq, b.received_at ?? null, start.id, JSON.stringify(b.files ?? []), b.note ?? null, u.id])).rows[0];
      await c.query('insert into revision_events (revision_id, state_id, at, by_user, holder_party, note) values ($1,$2,$3,$4,$5,$6)', [rv.id, start.id, rv.received_at, u.id, b.holder_party ?? null, b.note ?? null]);
      await c.query('update documents set current_state_id = $2 where id = $1', [id, start.id]);
      return rv;
    });
    await this.audit.log(u.id, pid, 'create', 'revision', r.id, b);
    return r;
  }

  /** تغییر وضعیت ویرایش جاری: فقط گذارهای تعریف‌شده، با اجازهٔ همان گذار (یا doc.review) */
  @Post('documents/:id/transition') @Require('doc.read')
  async transition(@Param('pid') pid: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const b = parse(z.object({ to: z.string().min(1), at: z.string().optional(), note: z.string().optional(), holder_party: uuid.nullable().optional() }), body);
    const d = await this.visible(pid, id, u.id, g);
    const rv = await this.db.one<{ id: string; state_id: string }>('select id, state_id from revisions where document_id = $1 order by seq desc limit 1', [id]);
    if (!rv) throw new BadRequestException('این مدرک هنوز ویرایشی ندارد');
    const tr = await this.db.one<{ to_state: string; capability_key: string | null; category: string; review_code: string | null }>(
      `select tr.to_state, tr.capability_key, s.category, s.review_code from documents d join doc_types t on t.id = d.type_id
         join workflow_transitions tr on tr.workflow_id = t.workflow_id and tr.from_state = $2
         join workflow_states s on s.id = tr.to_state where d.id = $1 and s.code = $3`, [id, rv.state_id, b.to]);
    if (!tr) throw new BadRequestException('این گذار در گردش‌کار تعریف نشده');
    const need = tr.capability_key || 'doc.review';
    const dec = await this.authz.decide(u.id, pid, need);
    if (!dec.allowed) throw new ForbiddenException({ message: 'اجازهٔ این تغییر وضعیت را ندارید', capability: need });
    const closes = ['approved', 'returned', 'closed', 'void'].includes(tr.category);
    await this.db.tx(async (c) => {
      await c.query('insert into revision_events (revision_id, state_id, at, by_user, holder_party, note) values ($1,$2,coalesce($3::timestamptz, now()),$4,$5,$6)', [rv.id, tr.to_state, b.at ?? null, u.id, b.holder_party ?? null, b.note ?? null]);
      await c.query(`update revisions set state_id = $2, review_code = coalesce($3, review_code), closed_at = case when $4 then coalesce($5::timestamptz, now()) else null end where id = $1`, [rv.id, tr.to_state, tr.review_code, closes, b.at ?? null]);
      await c.query('update documents set current_state_id = $2 where id = $1', [d.id, tr.to_state]);
    });
    await this.audit.log(u.id, pid, 'transition', 'document', id, b);
    return { ok: true };
  }

  // ================= ترنسمیتال =================
  @Get('transmittals') @Require('transmittal.read')
  async transmittals(@Param('pid') pid: string, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    let partyFilter = '';
    const params: unknown[] = [pid];
    if (g.own_party === true) { const m = await this.db.one<{ party_id: string | null }>('select party_id from memberships where project_id = $1 and user_id = $2', [pid, u.id]); params.push(m?.party_id ?? null); partyFilter = ' and (t.from_party = $2 or t.to_party = $2)'; }
    return this.db.q(`select t.*, fp.name as from_name, tp.name as to_name, (select count(*) from transmittal_items i where i.transmittal_id = t.id)::int as items
        from transmittals t left join parties fp on fp.id = t.from_party left join parties tp on tp.id = t.to_party where t.project_id = $1${partyFilter} order by t.sent_at desc`, params);
  }

  @Post('transmittals') @Require('transmittal.send')
  async send(@Param('pid') pid: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ number: z.string().min(1), from_party: uuid.nullable().optional(), to_party: uuid.nullable().optional(), purpose: z.string().optional(), due_at: z.string().optional(), note: z.string().optional(), revisions: z.array(uuid).min(1) }), body);
    const t = await this.db.tx(async (c) => {
      const tm = (await c.query(`insert into transmittals (project_id, number, from_party, to_party, purpose, due_at, note, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [pid, b.number, b.from_party ?? null, b.to_party ?? null, b.purpose ?? null, b.due_at ?? null, b.note ?? null, u.id])).rows[0];
      for (const r of b.revisions) {
        const ok = (await c.query('select 1 from revisions r join documents d on d.id = r.document_id where r.id = $1 and d.project_id = $2', [r, pid])).rowCount;
        if (!ok) throw new BadRequestException('ویرایش نامعتبر در ترنسمیتال');
        await c.query('insert into transmittal_items (transmittal_id, revision_id) values ($1,$2)', [tm.id, r]);
      }
      return tm;
    });
    await this.audit.log(u.id, pid, 'create', 'transmittal', t.id, b);
    return t;
  }

  // ================= MDR =================
  /** برنامه در برابر واقعی برای هر مدرک + پیشرفت وزنی (وزن مراحل از تنظیمات پروژه) */
  @Get('mdr') @Require('mdr.read')
  async mdr(@Param('pid') pid: string, @CurrentUser() u: AuthUser, @Grant() g: Constraints) {
    const W = ((await this.settings.value(pid, 'doc.progress_weights')) || {}) as Record<string, number>;
    const docs = await this.list(pid, u, Array.isArray(g.disciplines) ? { disciplines: g.disciplines } : {});
    const rows = docs.map((d: any) => {
      const cat = d.state_category as string | null; const code = d.review_code as string | null;
      const pct = !d.first_issue ? (W.none ?? 0) : cat === 'approved' ? ((code === 'B' ? W.approved_conditional : W.approved) ?? 100) : cat === 'returned' ? (W.returned ?? 55) : (W.issued ?? 40);
      const today = new Date();
      const issueLate = d.planned_issue ? days(d.planned_issue, d.first_issue || today) : null;
      return { id: d.id, number: d.number, title: d.title, discipline: d.discipline_code, originator: d.originator_name, type: d.type_code, weight: Number(d.weight),
        planned_issue: d.planned_issue, actual_issue: d.first_issue, planned_approval: d.planned_approval, state: d.state_name, review_code: code, revisions: d.rev_count, progress: pct,
        issue_delay_days: d.planned_issue && (d.first_issue ? new Date(d.first_issue) > new Date(d.planned_issue) : today > new Date(d.planned_issue)) ? issueLate : 0 };
    });
    const totalW = rows.reduce((t: number, r: any) => t + r.weight, 0) || 1;
    return { rows, summary: { documents: rows.length, progress: Math.round(rows.reduce((t: number, r: any) => t + r.weight * r.progress, 0) / totalW), issued: rows.filter((r: any) => r.actual_issue).length, late: rows.filter((r: any) => r.issue_delay_days > 0).length } };
  }
}
