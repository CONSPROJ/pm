import { Controller, Get } from '@nestjs/common';
import { Db } from '../db/db.service';
import { Public } from './http';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}
  @Public() @Get()
  async health() { await this.db.q('select 1'); return { ok: true }; }
}
