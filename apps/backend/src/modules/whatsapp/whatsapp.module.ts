import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppConversationService } from './conversation/whatsapp-conversation.service';
import { WhatsAppBaileysAuthStateService } from './session/whatsapp-baileys-auth-state.service';
import { WhatsAppAuthStoreService } from './session/whatsapp-auth-store.service';
import { WhatsAppEncryptionService } from './session/whatsapp-encryption.service';
import { WhatsAppSessionManagerService } from './session/whatsapp-session-manager.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway } from './whatsapp.gateway';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as SignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppAuthStoreService,
    WhatsAppBaileysAuthStateService,
    WhatsAppConversationService,
    WhatsAppEncryptionService,
    WhatsAppGateway,
    WhatsAppService,
    WhatsAppSessionManagerService,
  ],
})
export class WhatsAppModule {}
