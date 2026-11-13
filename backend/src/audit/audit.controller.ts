import { Controller, Get, Param, Query } from '@nestjs/common';
import { Db } from '../db/db.service';
import { Require } from '../common/http';

@Controller('projects/:pid/audit')
export class AuditController {
  constructor(private readonly db: Db) {}
  @Get() @Require('audit.read')
  list(@Param('pid') pid: string, @Query('before') before?: string, @Query('limit') limit?: string) {
    const n = Math.min(500, Math.max(1, Number(limit) || 200));
    return this.db.q(`select a.*, u.display_name as actor from audit_log a left join users u on u.id = a.actor_id
      where a.project_id = $1 and ($2::timestamptz is null or a.at < $2) order by a.at desc limit $3`, [pid, before || null, n]);
  }
}
