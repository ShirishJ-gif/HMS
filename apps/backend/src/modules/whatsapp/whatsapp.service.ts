import { Injectable, NotFoundException } from '@nestjs/common';
import { WhatsAppConnectionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { WhatsAppConversationService } from './conversation/whatsapp-conversation.service';
import { ListWhatsAppConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { ListWhatsAppMessagesDto } from './dto/list-whatsapp-messages.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppSessionManagerService } from './session/whatsapp-session-manager.service';

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: WhatsAppSessionManagerService,
    private readonly conversations: WhatsAppConversationService,
  ) {}

  async getConnection(propertyId: string, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { propertyId } });
    if (!connection) {
      return {
        status: WhatsAppConnectionStatus.NOT_CONNECTED,
        phoneNumber: null,
        phoneE164: null,
        displayName: null,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      };
    }
    if (connection.status === WhatsAppConnectionStatus.QR_REQUIRED) {
      const latestQr = await this.sessions.latestQr(propertyId);
      if (latestQr) {
        return {
          ...this.toConnectionResponse(connection),
          qrDataUrl: latestQr.qrDataUrl,
        };
      }

      const restarted = await this.sessions.start(propertyId);
      const qr = await this.sessions.waitForQr(propertyId);
      return {
        ...this.toConnectionResponse(restarted),
        qrDataUrl: qr?.qrDataUrl ?? null,
      };
    }
    if (
      connection.status === WhatsAppConnectionStatus.CONNECTED ||
      connection.status === WhatsAppConnectionStatus.DISCONNECTED ||
      connection.status === WhatsAppConnectionStatus.RECONNECTING
    ) {
      void this.sessions.start(propertyId).catch(() => undefined);
    }
    return {
      ...this.toConnectionResponse(connection),
      qrDataUrl: null,
    };
  }

  async startConnection(propertyId: string, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.sessions.start(propertyId);
    const qr = await this.sessions.waitForQr(propertyId);
    return {
      ...this.toConnectionResponse(connection),
      qrDataUrl: qr?.qrDataUrl ?? null,
    };
  }

  async stopConnection(propertyId: string, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.sessions.stop(propertyId);
    return this.toConnectionResponse(connection);
  }

  async deleteConnection(propertyId: string, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.sessions.logout(propertyId);
    return this.toConnectionResponse(connection);
  }

  async listConversations(propertyId: string, query: ListWhatsAppConversationsDto, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    return this.conversations.listConversations(propertyId, query);
  }

  async listMessages(propertyId: string, conversationId: string, query: ListWhatsAppMessagesDto, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    return this.conversations.listMessages(propertyId, conversationId, query);
  }

  async sendMessage(propertyId: string, conversationId: string, dto: SendWhatsAppMessageDto, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { propertyId } });
    if (!connection || connection.status !== WhatsAppConnectionStatus.CONNECTED) {
      throw new NotFoundException('WhatsApp is not connected for this property');
    }
    return { message: await this.sessions.sendText(propertyId, conversationId, dto.text.trim()) };
  }

  async markRead(propertyId: string, conversationId: string, user: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    return { conversation: await this.conversations.markRead(propertyId, conversationId) };
  }

  private toConnectionResponse(connection: {
    status: WhatsAppConnectionStatus;
    phoneNumber: string | null;
    phoneE164: string | null;
    displayName: string | null;
    lastConnectedAt: Date | null;
    lastDisconnectedAt: Date | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  }) {
    return {
      status: connection.status,
      phoneNumber: connection.phoneNumber,
      phoneE164: connection.phoneE164,
      displayName: connection.displayName,
      lastConnectedAt: connection.lastConnectedAt?.toISOString() ?? null,
      lastDisconnectedAt: connection.lastDisconnectedAt?.toISOString() ?? null,
      lastErrorCode: connection.lastErrorCode,
      lastErrorMessage: connection.lastErrorMessage,
    };
  }
}
