import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CredentialEncryptionService } from '../email-automation/credential-encryption.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [AuditLogModule],
  controllers: [GoogleCalendarController],
  providers: [CredentialEncryptionService, GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
