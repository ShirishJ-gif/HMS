import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WhatsAppConnectionStatus } from '@prisma/client';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsAppGateway } from '../whatsapp.gateway';
import { WhatsAppConversationService } from '../conversation/whatsapp-conversation.service';
import { normalizeBaileysMessage } from '../conversation/whatsapp-message-normalizer';
import { normalizeLidJid, normalizePhoneJid } from '../conversation/phone-normalizer';
import { WhatsAppBaileysAuthStateService } from './whatsapp-baileys-auth-state.service';
import { loadBaileys } from './baileys-loader';

type ManagedSession = {
  connectionId: string;
  propertyId: string;
  socket: WASocket;
};

type QrPayload = {
  connectionId: string;
  qrDataUrl: string;
  generatedAt: string;
};

@Injectable()
export class WhatsAppSessionManagerService {
  private readonly logger = new Logger(WhatsAppSessionManagerService.name);
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly latestQrByConnectionId = new Map<string, QrPayload>();
  private readonly qrWaiters = new Map<string, Array<(payload: QrPayload) => void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authState: WhatsAppBaileysAuthStateService,
    private readonly conversations: WhatsAppConversationService,
    private readonly gateway: WhatsAppGateway,
  ) {}

  async start(propertyId: string) {
    const connection = await this.getOrCreateConnection(propertyId);
    if (this.sessions.has(connection.id)) {
      return connection;
    }

    if (connection.status === WhatsAppConnectionStatus.LOGGED_OUT) {
      await this.prisma.whatsAppAuthRecord.deleteMany({ where: { connectionId: connection.id } });
      this.latestQrByConnectionId.delete(connection.id);
    }

    const startingConnection = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: WhatsAppConnectionStatus.CONNECTING,
        lastErrorCode: null,
        lastErrorMessage: null,
        ...(connection.status === WhatsAppConnectionStatus.LOGGED_OUT
          ? {
              phoneNumber: null,
              phoneE164: null,
              whatsappJid: null,
              displayName: null,
              sessionGeneration: { increment: 1 },
            }
          : {}),
      },
    });
    this.emitState(propertyId, WhatsAppConnectionStatus.CONNECTING);

    const baileys = await loadBaileys();
    const { state, saveCreds } = await this.authState.create(connection.id);
    const socket = baileys.default({
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: process.env.WHATSAPP_SYNC_FULL_HISTORY !== 'false',
      browser: ['HMS Admin', 'Chrome', '1.0.0'],
    });

    this.sessions.set(connection.id, { connectionId: connection.id, propertyId, socket });

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', async (update) => {
      if (update.qr) {
        const qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 260 });
        const payload = {
          connectionId: connection.id,
          qrDataUrl,
          generatedAt: new Date().toISOString(),
        };
        this.latestQrByConnectionId.set(connection.id, payload);
        this.resolveQrWaiters(connection.id, payload);
        await this.prisma.whatsAppConnection.update({
          where: { id: connection.id },
          data: { status: WhatsAppConnectionStatus.QR_REQUIRED },
        });
        this.gateway.emitToProperty(propertyId, 'whatsapp.qr', {
          connectionId: connection.id,
          qr: update.qr,
          qrDataUrl,
          generatedAt: payload.generatedAt,
        });
        this.emitState(propertyId, WhatsAppConnectionStatus.QR_REQUIRED);
      }

      if (update.connection === 'open') {
        const me = socket.user;
        this.latestQrByConnectionId.delete(connection.id);
        await this.prisma.whatsAppConnection.update({
          where: { id: connection.id },
          data: {
            status: WhatsAppConnectionStatus.CONNECTED,
            whatsappJid: me?.id ?? null,
            displayName: me?.name ?? me?.verifiedName ?? null,
            phoneNumber: me?.id?.split('@')[0] ?? null,
            phoneE164: me?.id ? `+${me.id.split('@')[0].split(':')[0]}` : null,
            lastConnectedAt: new Date(),
            lastDisconnectedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        });
        this.emitState(propertyId, WhatsAppConnectionStatus.CONNECTED);
      }

      if (update.connection === 'close') {
        const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === baileys.DisconnectReason.loggedOut;
        this.sessions.delete(connection.id);
        await this.prisma.whatsAppConnection.update({
          where: { id: connection.id },
          data: {
            status: loggedOut ? WhatsAppConnectionStatus.LOGGED_OUT : WhatsAppConnectionStatus.DISCONNECTED,
            lastDisconnectedAt: new Date(),
            lastErrorCode: statusCode ? String(statusCode) : null,
            lastErrorMessage: loggedOut ? 'WhatsApp linked device was logged out or revoked' : null,
          },
        });
        this.emitState(propertyId, loggedOut ? WhatsAppConnectionStatus.LOGGED_OUT : WhatsAppConnectionStatus.DISCONNECTED);
      }
    });

    socket.ev.on('messaging-history.set', async (event) => {
      const contacts = new Map<string, { name?: string; notify?: string; verifiedName?: string; phoneNumber?: string; id?: string }>();
      for (const contact of event.contacts) {
        for (const key of [contact.id, contact.lid, contact.phoneNumber]) {
          if (key) contacts.set(key, contact);
        }
      }
      const lidToPhoneJid = new Map<string, string>();
      for (const mapping of event.lidPnMappings ?? []) {
        const lid = normalizeLidJid(mapping.lid);
        const pn = normalizePhoneJid(mapping.pn);
        if (!lid || !pn) continue;
        lidToPhoneJid.set(lid, pn);
        const updated = await this.conversations.applyRemoteIdentity(connection, lid, { phoneJid: pn });
        if (updated) this.gateway.emitToProperty(propertyId, 'whatsapp.conversation.updated', updated);
      }
      let imported = 0;
      for (const message of event.messages) {
        const normalized = normalizeBaileysMessage(message);
        if (!normalized) continue;
        try {
          const contact = contacts.get(normalized.remoteJid) ?? contacts.get(normalized.remoteJidAlt ?? '');
          const mappedPhoneJid = lidToPhoneJid.get(normalized.remoteJid) ?? normalizePhoneJid(contact?.phoneNumber);
          const saved = await this.conversations.storeHistoryMessage(
            connection,
            normalized,
            contact,
            mappedPhoneJid ?? normalized.remoteJidAlt,
          );
          imported += 1;
          if (imported <= 50 || imported % 100 === 0) {
            this.gateway.emitToProperty(propertyId, 'whatsapp.conversation.updated', saved.conversation);
          }
        } catch (error) {
          this.logger.warn(`Failed to persist WhatsApp history message for property ${propertyId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.gateway.emitToProperty(propertyId, 'whatsapp.history.synced', {
        imported,
        progress: event.progress ?? null,
        isLatest: event.isLatest ?? null,
      });
    });

    socket.ev.on('lid-mapping.update', async (mapping) => {
      const updated = await this.conversations.applyRemoteIdentity(connection, mapping.lid, { phoneJid: mapping.pn });
      if (updated) this.gateway.emitToProperty(propertyId, 'whatsapp.conversation.updated', updated);
      this.gateway.emitToProperty(propertyId, 'whatsapp.lid.mapping.updated', {
        lid: mapping.lid,
        phone: mapping.pn,
      });
    });

    socket.ev.on('contacts.upsert', async (contacts) => {
      for (const contact of contacts) {
        const displayName = contact.name ?? contact.notify ?? contact.verifiedName ?? null;
        const remoteJids = [contact.id, contact.lid].filter(Boolean);
        for (const remoteJid of remoteJids) {
          const updated = await this.conversations.applyRemoteIdentity(connection, remoteJid, {
            phoneJid: contact.phoneNumber,
            displayName,
          });
          if (updated) this.gateway.emitToProperty(propertyId, 'whatsapp.conversation.updated', updated);
        }
      }
    });

    socket.ev.on('messages.upsert', async (event) => {
      for (const message of event.messages) {
        const normalized = normalizeBaileysMessage(message);
        if (!normalized) continue;
        try {
          const saved = await this.conversations.storeIncoming(connection, normalized);
          this.gateway.emitToProperty(propertyId, 'whatsapp.message.new', saved);
          this.gateway.emitToProperty(propertyId, 'whatsapp.conversation.updated', saved.conversation);
        } catch (error) {
          this.logger.warn(`Failed to persist WhatsApp message for property ${propertyId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

    return startingConnection;
  }

  async stop(propertyId: string) {
    const connection = await this.findConnection(propertyId);
    if (!connection) throw new NotFoundException('WhatsApp connection not found');
    this.sessions.get(connection.id)?.socket.end(undefined);
    this.sessions.delete(connection.id);
    this.latestQrByConnectionId.delete(connection.id);
    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { status: WhatsAppConnectionStatus.DISCONNECTED, lastDisconnectedAt: new Date() },
    });
    this.emitState(propertyId, WhatsAppConnectionStatus.DISCONNECTED);
    return updated;
  }

  async logout(propertyId: string) {
    const connection = await this.findConnection(propertyId);
    if (!connection) throw new NotFoundException('WhatsApp connection not found');
    const session = this.sessions.get(connection.id);
    if (session) {
      await session.socket.logout().catch(() => undefined);
      session.socket.end(undefined);
      this.sessions.delete(connection.id);
    }
    this.latestQrByConnectionId.delete(connection.id);
    await this.prisma.whatsAppAuthRecord.deleteMany({ where: { connectionId: connection.id } });
    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: WhatsAppConnectionStatus.NOT_CONNECTED,
        phoneNumber: null,
        phoneE164: null,
        whatsappJid: null,
        displayName: null,
        sessionGeneration: { increment: 1 },
        lastDisconnectedAt: new Date(),
      },
    });
    this.emitState(propertyId, WhatsAppConnectionStatus.NOT_CONNECTED);
    return updated;
  }

  async sendText(propertyId: string, conversationId: string, text: string) {
    const connection = await this.findConnection(propertyId);
    if (!connection) throw new NotFoundException('WhatsApp connection not found');
    const session = this.sessions.get(connection.id);
    if (!session) throw new NotFoundException('WhatsApp session is not connected');
    const conversation = await this.conversations.getConversationForSend(propertyId, conversationId);
    const localMessage = await this.conversations.storeLocalOutgoing(connection, conversationId, text);
    const sent = await session.socket.sendMessage(conversation.remoteJid, { text });
    const whatsappMessageId = sent?.key?.id;
    const updated = whatsappMessageId
      ? await this.conversations.markOutgoingSent(localMessage.id, whatsappMessageId)
      : localMessage;
    this.gateway.emitToProperty(propertyId, 'whatsapp.message.updated', updated);
    return updated;
  }

  private async getOrCreateConnection(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');
    return this.prisma.whatsAppConnection.upsert({
      where: { propertyId },
      create: {
        propertyId,
        organizationId: property.organizationId,
        status: WhatsAppConnectionStatus.NOT_CONNECTED,
      },
      update: {
        organizationId: property.organizationId,
      },
    });
  }

  private findConnection(propertyId: string) {
    return this.prisma.whatsAppConnection.findUnique({ where: { propertyId } });
  }

  async latestQr(propertyId: string) {
    const connection = await this.findConnection(propertyId);
    return connection ? this.latestQrByConnectionId.get(connection.id) ?? null : null;
  }

  async waitForQr(propertyId: string, timeoutMs = 15000) {
    const connection = await this.findConnection(propertyId);
    if (!connection) return null;
    const current = this.latestQrByConnectionId.get(connection.id);
    if (current) return current;

    return new Promise<QrPayload | null>((resolve) => {
      const timeout = setTimeout(() => {
        const waiters = this.qrWaiters.get(connection.id) ?? [];
        this.qrWaiters.set(connection.id, waiters.filter((waiter) => waiter !== resolve));
        resolve(null);
      }, timeoutMs);
      const waiter = (payload: QrPayload) => {
        clearTimeout(timeout);
        resolve(payload);
      };
      this.qrWaiters.set(connection.id, [...(this.qrWaiters.get(connection.id) ?? []), waiter]);
    });
  }

  private emitState(propertyId: string, status: WhatsAppConnectionStatus) {
    this.gateway.emitToProperty(propertyId, 'whatsapp.connection.state', { status });
  }

  private resolveQrWaiters(connectionId: string, payload: QrPayload) {
    const waiters = this.qrWaiters.get(connectionId) ?? [];
    this.qrWaiters.delete(connectionId);
    for (const waiter of waiters) waiter(payload);
  }
}
