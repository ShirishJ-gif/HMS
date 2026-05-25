import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { WebhookService } from './webhook.service';

@Controller()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post('webhooks/telegram')
  async ingestTelegram(@Body() body: Record<string, unknown>) {
    const chatId = this.telegramChatId(body);
    const text = this.telegramMessageText(body);

    if (chatId && text && ['/start', 'hi'].includes(text.trim().toLowerCase())) {
      await this.replyWithTelegramChatId(chatId);
    }

    return { ok: true };
  }

  @Public()
  @Post('webhooks/zodomus')
  async ingestZodomus(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.webhookService.ingest('channel', 'zodomus', body, headers, request.rawBody);
    response.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Public()
  @Post('webhooks/:domain/:provider')
  async ingest(
    @Param('domain') domain: string,
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.webhookService.ingest(domain, provider, body, headers, request.rawBody);
    response.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Get('webhook-events')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.webhookService.findAll(query, user);
  }

  private telegramChatId(body: Record<string, unknown>) {
    const message = this.readObject(body.message);
    const chat = this.readObject(message?.chat);
    const id = chat?.id;
    return typeof id === 'number' || typeof id === 'string' ? String(id) : null;
  }

  private telegramMessageText(body: Record<string, unknown>) {
    const message = this.readObject(body.message);
    const text = message?.text;
    return typeof text === 'string' ? text : null;
  }

  private async replyWithTelegramChatId(chatId: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Your Telegram chat ID is ${chatId}`,
        disable_web_page_preview: true,
      }),
    });
  }

  private readObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }
}
