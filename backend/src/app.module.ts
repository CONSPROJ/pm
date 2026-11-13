import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DbModule } from './db/db.module';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { AccessGuard } from './auth/guards';
import { AuthzService } from './authz/authz.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { ProjectsController } from './projects/projects.controller';
import { AccessController } from './access/access.controller';
import { DocumentsController } from './documents/documents.controller';
import { HealthController } from './common/health.controller';

@Module({
  imports: [DbModule],
  controllers: [HealthController, AuthController, ProjectsController, AccessController, SettingsController, DocumentsController, AuditController],
  providers: [AuthService, AuthzService, AuditService, SettingsService, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
