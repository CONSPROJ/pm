import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { SettingsService } from './settings.service';
import { AuthUser, CurrentUser, parse, Require } from '../common/http';
import { AuditService } from '../audit/audit.service';

@Controller('projects/:pid/settings')
export class SettingsController {
  constructor(private readonly s: SettingsService, private readonly audit: AuditService) {}

  @Get() @Require('project.read')
  list(@Param('pid') pid: string) { return this.s.list(pid); }

  @Put(':key') @Require('settings.manage')
  async set(@Param('pid') pid: string, @Param('key') key: string, @Body() body: unknown, @CurrentUser() u: AuthUser) {
    const b = parse(z.object({ value: z.unknown() }), body);
    await this.s.set(pid, key, b.value, u.id);
    await this.audit.log(u.id, pid, 'set', 'setting', key, { value: b.value });
    return { ok: true };
  }

  @Delete(':key') @Require('settings.manage')
  async reset(@Param('pid') pid: string, @Param('key') key: string, @CurrentUser() u: AuthUser) {
    await this.s.reset(pid, key);
    await this.audit.log(u.id, pid, 'reset', 'setting', key);
    return { ok: true };
  }
}
