import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { WhatsAppSocketUser } from './types/whatsapp.types';

type WhatsAppSocket = Socket & { data: { user?: WhatsAppSocketUser } };

@WebSocketGateway({
  namespace: '/whatsapp',
  cors: { origin: true, credentials: true },
})
export class WhatsAppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WhatsAppGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: WhatsAppSocket) {
    const token = this.readToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const user = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
      client.data.user = {
        ...user,
        socketId: client.id,
        allowedPropertyIds: await this.allowedPropertyIds(user),
      };
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: WhatsAppSocket) {
    this.logger.debug(`WhatsApp socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('whatsapp.subscribe')
  async subscribe(client: WhatsAppSocket, payload: { propertyId?: string }) {
    const propertyId = payload?.propertyId;
    const user = client.data.user;
    if (!user || !propertyId || !this.canAccessProperty(user, propertyId)) {
      return { ok: false };
    }
    await client.join(this.propertyRoom(propertyId));
    return { ok: true };
  }

  emitToProperty(propertyId: string, event: string, data: unknown) {
    this.server.to(this.propertyRoom(propertyId)).emit(event, data);
  }

  private propertyRoom(propertyId: string) {
    return `property:${propertyId}`;
  }

  private readToken(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();
    const header = client.handshake.headers.authorization;
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }

  private async allowedPropertyIds(user: AuthenticatedUser) {
    if (user.role === UserRole.PLATFORM_OWNER) return null;
    if (user.role === UserRole.ORG_OWNER && user.organization_id) {
      const properties = await this.prisma.property.findMany({
        where: { organizationId: user.organization_id },
        select: { id: true },
      });
      return properties.map((property) => property.id);
    }
    return user.property_id ? [user.property_id] : [];
  }

  private canAccessProperty(user: WhatsAppSocketUser, propertyId: string) {
    return user.allowedPropertyIds === null || user.allowedPropertyIds.includes(propertyId);
  }
}
