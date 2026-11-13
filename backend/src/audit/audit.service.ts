import { Injectable } from '@nestjs/common';
import { Db } from '../db/db.service';

/** گزارش کار سمت سرور: هر تغییر با نام انجام‌دهنده، پروژه و جزئیات */
@Injectable()
export class AuditService {
  constructor(private readonly db: Db) {}
  async log(actorId: string | null, projectId: string | null, action: string, entity: string, entityId: string | null, data: unknown = {}, ip?: string) {
    await this.db.q('insert into audit_log (actor_id, project_id, action, entity, entity_id, data, ip) values ($1,$2,$3,$4,$5,$6,$7)',
      [actorId, projectId, action, entity, entityId, JSON.stringify(data ?? {}), ip ?? null]);
  }
}
