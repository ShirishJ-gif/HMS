import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailAutomationPolicyService } from './automation/email-automation-policy.service';
import { EmailReservationResolverService } from './automation/email-reservation-resolver.service';
import { SourceDetectorService } from './classification/source-detector.service';
import { EmailAutomationController } from './email-automation.controller';
import { EmailAutomationService } from './email-automation.service';
import { ParserRegistryService } from './parsers/parser-registry.service';
import { CredentialEncryptionService } from './credential-encryption.service';
import { GmailEmailProvider } from './providers/gmail-email.provider';
import { MicrosoftEmailProvider } from './providers/microsoft-email.provider';
import { OAuthStateService } from './oauth-state.service';

@Module({
  imports: [AuditLogModule, BackgroundJobModule, InventoryModule, PrismaModule],
  controllers: [EmailAutomationController],
  providers: [
    EmailAutomationPolicyService,
    EmailReservationResolverService,
    CredentialEncryptionService,
    GmailEmailProvider,
    MicrosoftEmailProvider,
    OAuthStateService,
    SourceDetectorService,
    EmailAutomationService,
    ParserRegistryService,
  ],
})
export class EmailAutomationModule {}
