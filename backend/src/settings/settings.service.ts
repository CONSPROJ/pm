import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Db } from '../db/db.service';

/** قوانین و تنظیمات: مقدار پروژه ← مقدار کل سامانه ← پیش‌فرضِ تعریف. هیچ عددی در کد نیست. */
@Injectable()
export class SettingsService {
  constructor(private readonly db: Db) {}

  async value(projectId: string | null, key: string): Promise<unknown> {
    const r = await this.db.one<{ v: unknown }>(
      `select coalesce(
          (select value from settings where project_id = $1 and key = $2),
          (select value from settings where project_id is null and key = $2),
          (select default_value from setting_defs where key = $2)) as v`, [projectId, key]);
    return r ? r.v : null;
  }

  async list(projectId: string | null) {
    return this.db.q(
      `select d.key, d.module, d.title, d.description, d.value_type, d.options, d.default_value,
              sp.value as project_value, sg.value as global_value,
              coalesce(sp.value, sg.value, d.default_value) as value
         from setting_defs d
         left join settings sp on sp.key = d.key and sp.project_id = $1
         left join settings sg on sg.key = d.key and sg.project_id is null
        order by d.module, d.key`, [projectId]);
  }

  async set(projectId: string | null, key: string, value: unknown, userId: string) {
    const d = await this.db.one<{ value_type: string; options: unknown }>('select value_type, options from setting_defs where key = $1', [key]);
    if (!d) throw new NotFoundException('چنین قاعده‌ای تعریف نشده');
    const ok = d.value_type === 'number' ? typeof value === 'number' && isFinite(value)
      : d.value_type === 'boolean' ? typeof value === 'boolean'
      : d.value_type === 'text' ? typeof value === 'string'
      : d.value_type === 'enum' ? Array.isArray(d.options) && (d.options as unknown[]).includes(value)
      : true;
    if (!ok) throw new BadRequestException('نوع مقدار با تعریف قاعده نمی‌خواند (' + d.value_type + ')');
    await this.db.q(
      `insert into settings (project_id, key, value, updated_by) values ($1,$2,$3,$4)
       on conflict (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [projectId, key, JSON.stringify(value), userId]);
  }

  async reset(projectId: string | null, key: string) {
    await this.db.q('delete from settings where key = $2 and ' + (projectId ? 'project_id = $1' : 'project_id is null and $1::uuid is null'), [projectId, key]);
  }
}
