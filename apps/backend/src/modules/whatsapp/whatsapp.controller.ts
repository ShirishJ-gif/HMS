import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListWhatsAppConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { ListWhatsAppMessagesDto } from './dto/list-whatsapp-messages.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('properties/:propertyId/whatsapp')
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Get('connection')
  getConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.whatsAppService.getConnection(propertyId, user);
  }

  @Post('connection/start')
  startConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.whatsAppService.startConnection(propertyId, user);
  }

  @Post('connection/stop')
  stopConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.whatsAppService.stopConnection(propertyId, user);
  }

  @Delete('connection')
  deleteConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    return this.whatsAppService.deleteConnection(propertyId, user);
  }

  @Get('conversations')
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: ListWhatsAppConversationsDto,
  ) {
    return this.whatsAppService.listConversations(propertyId, query, user);
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: ListWhatsAppMessagesDto,
  ) {
    return this.whatsAppService.listMessages(propertyId, conversationId, query, user);
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendWhatsAppMessageDto,
  ) {
    return this.whatsAppService.sendMessage(propertyId, conversationId, dto, user);
  }

  @Post('conversations/:conversationId/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.whatsAppService.markRead(propertyId, conversationId, user);
  }
}
