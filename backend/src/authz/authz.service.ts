import { Injectable } from '@nestjs/common';
import { Db } from '../db/db.service';

export type Constraints = Record<string, string[] | boolean>;
export interface Decision {
  allowed: boolean;
  /** محدودیت‌های اجازه (مثلاً فقط رشته‌های سازه)؛ خالی یعنی بی‌محدودیت */
  constraints: Constraints;
  /** از کجا آمد: root، user، group، position، party، party_kind، level، default، none */
  source: string;
}
export interface Subject { userId: string; isRoot: boolean; }

interface Ctx {
  isRoot: boolean;
  member: { level: number | null; position_id: string | null; party_id: string | null; party_kind: string | null; status: string } | null;
  groups: string[];
  positions: string[];
}

/**
 * موتور دسترسی سمت سرور.
 * ترتیب تصمیم (از خاص به عام): فرد ← گروه‌ها و سمت و طرف ← نوع طرف ← سطح ← پیش‌فرض اجازه.
 * در هر لایه «منع» بر «اجازه» مقدم است؛ محدودیت‌های چند اجازهٔ هم‌لایه با هم جمع می‌شوند.
 * کاربر صفر (is_root) همیشه همه‌چیز دارد. هیچ قاعده‌ای در کد نیست؛ همه از جدول‌ها می‌آید.
 */
@Injectable()
export class AuthzService {
  constructor(private readonly db: Db) {}

  async context(userId: string, projectId: string | null): Promise<Ctx> {
    const u = await this.db.one<{ is_root: boolean }>('select is_root from users where id = $1 and status = $2', [userId, 'active']);
    if (!u) return { isRoot: false, member: null, groups: [], positions: [] };
    if (!projectId) return { isRoot: u.is_root, member: null, groups: [], positions: [] };
    const member = await this.db.one(
      `select m.level, m.position_id, m.party_id, p.kind as party_kind, m.status
         from memberships m left join parties p on p.id = m.party_id
        where m.project_id = $1 and m.user_id = $2`, [projectId, userId]);
    const groups = (await this.db.q<{ group_id: string }>(
      `select gm.group_id from group_members gm join groups g on g.id = gm.group_id where g.project_id = $1 and gm.user_id = $2`, [projectId, userId])).map((r) => r.group_id);
    return { isRoot: u.is_root, member: member as Ctx['member'], groups, positions: member?.position_id ? [member.position_id] : [] };
  }

  async decide(userId: string, projectId: string | null, cap: string, ctx?: Ctx): Promise<Decision> {
    const c = ctx || (await this.context(userId, projectId));
    if (c.isRoot) return { allowed: true, constraints: {}, source: 'root' };
    const capRow = await this.db.one<{ default_levels: number[] }>('select default_levels from capabilities where key = $1', [cap]);
    if (!capRow) return { allowed: false, constraints: {}, source: 'unknown_capability' };
    if (projectId && (!c.member || c.member.status !== 'active')) return { allowed: false, constraints: {}, source: 'not_member' };
    const grants = await this.db.q<{ subject_type: string; subject_id: string; effect: string; constraints: Constraints }>(
      `select subject_type, subject_id, effect, constraints from grants
        where capability_key = $1 and (project_id is null or project_id = $2)`, [cap, projectId]);
    const m = c.member;
    const tiers: { name: string; match: (g: { subject_type: string; subject_id: string }) => boolean }[] = [
      { name: 'user', match: (g) => g.subject_type === 'user' && g.subject_id === userId },
      { name: 'group', match: (g) => (g.subject_type === 'group' && c.groups.includes(g.subject_id))
          || (g.subject_type === 'position' && c.positions.includes(g.subject_id))
          || (g.subject_type === 'party' && !!m?.party_id && g.subject_id === m.party_id) },
      { name: 'party_kind', match: (g) => g.subject_type === 'party_kind' && !!m?.party_kind && g.subject_id === m.party_kind },
      { name: 'level', match: (g) => g.subject_type === 'level' && m?.level != null && g.subject_id === String(m.level) },
    ];
    for (const t of tiers) {
      const hit = grants.filter(t.match);
      if (!hit.length) continue;
      if (hit.some((g) => g.effect === 'deny')) return { allowed: false, constraints: {}, source: t.name };
      return { allowed: true, constraints: mergeConstraints(hit.map((g) => g.constraints || {})), source: t.name };
    }
    const lv = m?.level;
    if (lv != null && (capRow.default_levels || []).includes(lv)) return { allowed: true, constraints: {}, source: 'default' };
    return { allowed: false, constraints: {}, source: 'none' };
  }

  /** همهٔ اجازه‌های یک نفر در یک پروژه (برای رابط کاربری و توضیح «چرا») */
  async effective(userId: string, projectId: string | null): Promise<Record<string, Decision>> {
    const ctx = await this.context(userId, projectId);
    const caps = await this.db.q<{ key: string }>('select key from capabilities order by key');
    const out: Record<string, Decision> = {};
    for (const k of caps) out[k.key] = await this.decide(userId, projectId, k.key, ctx);
    return out;
  }
}

/** اجتماع محدودیت‌ها؛ اگر یکی از اجازه‌ها بی‌محدودیت باشد، کل بی‌محدودیت است */
export function mergeConstraints(list: Constraints[]): Constraints {
  if (list.some((c) => !c || Object.keys(c).length === 0)) return {};
  const out: Constraints = {};
  for (const c of list) {
    for (const [k, v] of Object.entries(c)) {
      if (typeof v === 'boolean') { out[k] = (out[k] === false || v === false) ? false : true; continue; }
      const cur = Array.isArray(out[k]) ? (out[k] as string[]) : [];
      out[k] = Array.from(new Set(cur.concat(v)));
    }
  }
  // کلیدی که فقط در بعضی اجازه‌ها محدود شده، در بقیه آزاد است → آزاد
  for (const k of Object.keys(out)) if (!list.every((c) => k in c)) delete out[k];
  return out;
}
