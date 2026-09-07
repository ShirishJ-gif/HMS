import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BookingStatus,
  Prisma,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { NormalizedWhatsAppMessage } from '../types/whatsapp.types';
import { displayableJid, normalizeLidJid, normalizePhoneJid, phoneFromWhatsAppJid, normalizePhone } from './phone-normalizer';

@Injectable()
export class WhatsAppConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(propertyId: string, query: { cursor?: string; limit?: number; search?: string }) {
    const take = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const search = query.search?.trim();
    const conversations = await this.prisma.whatsAppConversation.findMany({
      where: {
        propertyId,
        archived: false,
        ...(search
          ? {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { phoneE164: { contains: search, mode: 'insensitive' } },
                { lastMessagePreview: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.conversationInclude(),
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1,
    });

    const page = conversations.slice(0, take);
    return {
      items: page.map((conversation) => this.toConversationResponse(conversation)),
      nextCursor: conversations.length > take ? conversations[take]?.id ?? null : null,
    };
  }

  async listMessages(propertyId: string, conversationId: string, query: { cursor?: string; limit?: number }) {
    await this.assertConversation(propertyId, conversationId);
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { propertyId, conversationId },
      orderBy: { whatsappTimestamp: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: take + 1,
    });
    const page = messages.slice(0, take);
    return {
      items: page.reverse().map((message) => this.toMessageResponse(message)),
      nextCursor: messages.length > take ? messages[take]?.id ?? null : null,
    };
  }

  async markRead(propertyId: string, conversationId: string) {
    const conversation = await this.assertConversation(propertyId, conversationId);
    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
      include: this.conversationInclude(),
    });
    return this.toConversationResponse(updated);
  }

  async getConversationForSend(propertyId: string, conversationId: string) {
    return this.assertConversation(propertyId, conversationId);
  }

  async storeIncoming(connection: { id: string; propertyId: string; organizationId: string | null }, normalized: NormalizedWhatsAppMessage) {
    return this.storeMessage(connection, normalized);
  }

  async storeHistoryMessage(
    connection: { id: string; propertyId: string; organizationId: string | null },
    normalized: NormalizedWhatsAppMessage,
    contact?: { name?: string; notify?: string; verifiedName?: string; phoneNumber?: string; id?: string } | null,
    phoneJid?: string | null,
  ) {
    return this.storeMessage(connection, normalized, {
      incrementUnread: false,
      contactName: contact?.name ?? contact?.notify ?? contact?.verifiedName ?? null,
      phoneJid: contact?.phoneNumber ?? phoneJid ?? null,
    });
  }

  async storeLocalOutgoing(
    connection: { id: string; propertyId: string; organizationId: string | null },
    conversationId: string,
    text: string,
  ) {
    const conversation = await this.assertConversation(connection.propertyId, conversationId);
    const now = new Date();
    const message = await this.prisma.whatsAppMessage.create({
      data: {
        propertyId: connection.propertyId,
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        whatsappMessageId: `local:${randomUUID()}`,
        remoteJid: conversation.remoteJid,
        direction: WhatsAppMessageDirection.OUTBOUND,
        type: WhatsAppMessageType.TEXT,
        status: WhatsAppMessageStatus.PENDING,
        body: text,
        fromMe: true,
        whatsappTimestamp: now,
        rawType: 'local_text',
      },
    });
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageId: message.id,
        lastMessagePreview: text,
        lastMessageAt: now,
      },
    });
    return this.toMessageResponse(message);
  }

  async applyRemoteIdentity(
    connection: { id: string; propertyId: string; organizationId: string | null },
    remoteJid: string | null | undefined,
    identity: { phoneJid?: string | null; displayName?: string | null },
  ) {
    const resolvedRemoteJid = normalizeLidJid(remoteJid) ?? remoteJid?.trim();
    if (!resolvedRemoteJid) return null;

    const phoneJid = normalizePhoneJid(identity.phoneJid);
    const phoneE164 = phoneJid ? phoneFromWhatsAppJid(phoneJid) : null;
    const match = phoneE164 ? await this.findGuestReservationMatch(connection.propertyId, phoneE164) : null;
    const displayName = match?.guest?.name ?? identity.displayName ?? phoneE164 ?? undefined;

    if (!phoneE164 && !displayName) return null;

    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: {
        connectionId_remoteJid: {
          connectionId: connection.id,
          remoteJid: resolvedRemoteJid,
        },
      },
    });
    if (!conversation) return null;

    const updated = await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        phoneE164: phoneE164 ?? undefined,
        displayName,
        guestId: match?.guest?.id ?? undefined,
        reservationGroupId: match?.reservation?.id ?? undefined,
      },
      include: this.conversationInclude(),
    });

    return this.toConversationResponse(updated);
  }

  async markOutgoingSent(localMessageId: string, whatsappMessageId: string) {
    const message = await this.prisma.whatsAppMessage.update({
      where: { id: localMessageId },
      data: {
        whatsappMessageId,
        status: WhatsAppMessageStatus.SENT,
      },
    });
    return this.toMessageResponse(message);
  }

  private async storeMessage(
    connection: { id: string; propertyId: string; organizationId: string | null },
    normalized: NormalizedWhatsAppMessage,
    options: { incrementUnread?: boolean; contactName?: string | null; phoneJid?: string | null } = {},
  ) {
    const phoneJid = normalizePhoneJid(options.phoneJid ?? normalized.remoteJidAlt);
    const phoneE164 = phoneFromWhatsAppJid(phoneJid ?? normalized.remoteJid);
    const match = phoneE164 ? await this.findGuestReservationMatch(connection.propertyId, phoneE164) : null;
    const displayName = match?.guest?.name ?? options.contactName ?? phoneE164 ?? displayableJid(normalized.remoteJid) ?? 'Unknown contact';
    const conversation = await this.prisma.whatsAppConversation.upsert({
      where: {
        connectionId_remoteJid: {
          connectionId: connection.id,
          remoteJid: normalized.remoteJid,
        },
      },
      create: {
        propertyId: connection.propertyId,
        organizationId: connection.organizationId,
        connectionId: connection.id,
        remoteJid: normalized.remoteJid,
        phoneE164,
        displayName,
        guestId: match?.guest?.id ?? null,
        reservationGroupId: match?.reservation?.id ?? null,
        isGroup: normalized.remoteJid.endsWith('@g.us'),
      },
      update: {
        phoneE164,
        guestId: match?.guest?.id ?? undefined,
        reservationGroupId: match?.reservation?.id ?? undefined,
        displayName,
      },
    });

    const direction = normalized.fromMe ? WhatsAppMessageDirection.OUTBOUND : WhatsAppMessageDirection.INBOUND;
    const type = normalized.body ? WhatsAppMessageType.TEXT : WhatsAppMessageType.UNSUPPORTED;
    const message = await this.prisma.whatsAppMessage.upsert({
      where: {
        conversationId_whatsappMessageId: {
          conversationId: conversation.id,
          whatsappMessageId: normalized.whatsappMessageId,
        },
      },
      create: {
        propertyId: connection.propertyId,
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        whatsappMessageId: normalized.whatsappMessageId,
        remoteJid: normalized.remoteJid,
        direction,
        type,
        status: normalized.fromMe ? WhatsAppMessageStatus.SENT : WhatsAppMessageStatus.DELIVERED,
        body: normalized.body,
        fromMe: normalized.fromMe,
        whatsappTimestamp: normalized.timestamp,
        rawType: normalized.rawType,
      },
      update: {
        status: normalized.fromMe ? WhatsAppMessageStatus.SENT : WhatsAppMessageStatus.DELIVERED,
        body: normalized.body,
      },
    });

    const updatedConversation = await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageId: message.id,
        lastMessagePreview: normalized.body ?? this.previewForType(type),
        lastMessageAt: normalized.timestamp,
        unreadCount: !normalized.fromMe && options.incrementUnread !== false ? { increment: 1 } : undefined,
      },
      include: this.conversationInclude(),
    });

    return {
      conversation: this.toConversationResponse(updatedConversation),
      message: this.toMessageResponse(message),
    };
  }

  private async findGuestReservationMatch(propertyId: string, phoneE164: string) {
    const guests = await this.prisma.guest.findMany({
      where: { propertyId },
      include: {
        reservationGroups: {
          where: { status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] } },
          include: {
            rooms: {
              include: { room: true },
              orderBy: { arrivalDate: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const guest = guests.find((candidate) => normalizePhone(candidate.phone) === phoneE164);
    if (!guest) return null;
    const reservation = guest.reservationGroups[0] ?? null;
    return { guest, reservation };
  }

  private async assertConversation(propertyId: string, conversationId: string) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, propertyId },
    });
    if (!conversation) throw new NotFoundException('WhatsApp conversation not found');
    return conversation;
  }

  private conversationInclude() {
    return {
      guest: { select: { id: true, name: true, phone: true, email: true } },
      reservationGroup: {
        select: {
          id: true,
          externalReservationId: true,
          source: true,
          status: true,
          rooms: {
            select: {
              room: { select: { roomNumber: true } },
              arrivalDate: true,
              departureDate: true,
            },
            orderBy: { arrivalDate: 'desc' as const },
            take: 1,
          },
        },
      },
    };
  }

  private toConversationResponse(conversation: Prisma.WhatsAppConversationGetPayload<{ include: ReturnType<WhatsAppConversationService['conversationInclude']> }>) {
    const room = conversation.reservationGroup?.rooms[0];
    return {
      id: conversation.id,
      displayName: conversation.displayName,
      phoneE164: conversation.phoneE164,
      remoteJid: conversation.remoteJid,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: conversation.unreadCount,
      guest: conversation.guest
        ? {
            id: conversation.guest.id,
            name: conversation.guest.name,
            phone: conversation.guest.phone,
            email: conversation.guest.email,
          }
        : null,
      reservation: conversation.reservationGroup
        ? {
            id: conversation.reservationGroup.id,
            code: conversation.reservationGroup.externalReservationId,
            source: conversation.reservationGroup.source,
            status: conversation.reservationGroup.status,
            room: room?.room?.roomNumber ?? null,
            checkIn: room?.arrivalDate?.toISOString().slice(0, 10) ?? null,
            checkOut: room?.departureDate?.toISOString().slice(0, 10) ?? null,
          }
        : null,
    };
  }

  private toMessageResponse(message: Prisma.WhatsAppMessageGetPayload<Record<string, never>>) {
    return {
      id: message.id,
      whatsappMessageId: message.whatsappMessageId,
      direction: message.direction,
      type: message.type,
      status: message.status,
      body: message.body,
      fromMe: message.fromMe,
      whatsappTimestamp: message.whatsappTimestamp.toISOString(),
      receivedAt: message.receivedAt.toISOString(),
    };
  }

  private previewForType(type: WhatsAppMessageType) {
    return type === WhatsAppMessageType.TEXT ? '' : `[${type.toLowerCase()}]`;
  }
}
