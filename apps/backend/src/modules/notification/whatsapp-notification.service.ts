import { Injectable, Logger } from '@nestjs/common';

export type ReservationConfirmationPayload = {
  guestName: string;
  phone: string;
  roomNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
};

export type OwnerReservationNotificationPayload = {
  ownerPhone: string | null;
  propertyName: string;
  guestName: string;
  guestPhone: string;
  roomCategoryName: string;
  checkInDate: Date;
  checkOutDate: Date;
  totalAmount: number;
};

export type CheckInReminderPayload = ReservationConfirmationPayload;
export type OwnerReservationChangePayload = OwnerReservationNotificationPayload;

type WhatsAppMessage = {
  to: string;
  template: string;
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  telegramText?: string;
};

type NotificationProvider = 'mock' | 'cloud_api' | 'telegram';

@Injectable()
export class WhatsAppNotificationService {
  private readonly logger = new Logger(WhatsAppNotificationService.name);
  private readonly provider = (process.env.NOTIFICATION_PROVIDER ?? process.env.WHATSAPP_PROVIDER ?? 'mock') as NotificationProvider;

  async sendReservationConfirmation(payload: ReservationConfirmationPayload) {
    await this.safeSend({
      to: payload.phone,
      template: 'reservation_confirmation',
      telegramText: [
        '✅ Reservation confirmed',
        '',
        `👤 Guest: ${payload.guestName}`,
        `📞 Phone: ${payload.phone}`,
        `🛏️ Room: ${payload.roomNumber}`,
        '',
        `📅 Stay: ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}`,
      ].join('\n'),
      body: `Reservation confirmed for ${payload.guestName}. Room ${payload.roomNumber}, ${this.formatDate(
        payload.checkInDate,
      )} to ${this.formatDate(payload.checkOutDate)}.`,
    });
  }

  async sendOwnerReservationNotification(payload: OwnerReservationNotificationPayload) {
    if (!payload.ownerPhone) {
      this.logger.warn(`Owner reservation notification skipped for ${payload.propertyName}: property phone is missing`);
      return;
    }

    await this.safeSend({
      to: payload.ownerPhone,
      template: 'owner_reservation_notification',
      telegramText: [
        '🏨 New reservation',
        payload.propertyName,
        '',
        `👤 Guest: ${payload.guestName}`,
        `📞 Guest phone: ${payload.guestPhone}`,
        `🛏️ Room type: ${payload.roomCategoryName}`,
        '',
        `📅 Stay: ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}`,
        `💰 Total: INR ${payload.totalAmount}`,
      ].join('\n'),
      body: `New reservation at ${payload.propertyName}: ${payload.guestName} (${payload.guestPhone}) reserved ${
        payload.roomCategoryName
      } from ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}. Total: INR ${
        payload.totalAmount
      }.`,
      buttons: [
        { id: 'view_reservation', title: 'View reservation' },
        { id: 'call_guest', title: 'Call guest' },
      ],
    });
  }

  async sendOwnerReservationModifiedNotification(payload: OwnerReservationChangePayload) {
    if (!payload.ownerPhone) {
      this.logger.warn(`Owner reservation modified notification skipped for ${payload.propertyName}: property phone is missing`);
      return;
    }

    await this.safeSend({
      to: payload.ownerPhone,
      template: 'owner_reservation_modified',
      telegramText: [
        '✏️ Reservation modified',
        payload.propertyName,
        '',
        `👤 Guest: ${payload.guestName}`,
        `📞 Guest phone: ${payload.guestPhone}`,
        `🛏️ Room type: ${payload.roomCategoryName}`,
        '',
        `📅 Stay: ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}`,
        `💰 Total: INR ${payload.totalAmount}`,
      ].join('\n'),
      body: `Reservation modified at ${payload.propertyName}: ${payload.guestName} (${payload.guestPhone}) now has ${
        payload.roomCategoryName
      } from ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}. Total: INR ${
        payload.totalAmount
      }.`,
    });
  }

  async sendOwnerReservationCancelledNotification(payload: OwnerReservationChangePayload) {
    if (!payload.ownerPhone) {
      this.logger.warn(`Owner reservation cancelled notification skipped for ${payload.propertyName}: property phone is missing`);
      return;
    }

    await this.safeSend({
      to: payload.ownerPhone,
      template: 'owner_reservation_cancelled',
      telegramText: [
        '❌ Reservation cancelled',
        payload.propertyName,
        '',
        `👤 Guest: ${payload.guestName}`,
        `📞 Guest phone: ${payload.guestPhone}`,
        `🛏️ Room type: ${payload.roomCategoryName}`,
        '',
        `📅 Stay: ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}`,
        `💰 Previous total: INR ${payload.totalAmount}`,
      ].join('\n'),
      body: `Reservation cancelled at ${payload.propertyName}: ${payload.guestName} (${payload.guestPhone}), ${
        payload.roomCategoryName
      }, ${this.formatDate(payload.checkInDate)} to ${this.formatDate(payload.checkOutDate)}. Previous total: INR ${
        payload.totalAmount
      }.`,
    });
  }

  async sendCheckInReminder(payload: CheckInReminderPayload) {
    await this.safeSend({
      to: payload.phone,
      template: 'check_in_reminder',
      telegramText: [
        '🔔 Check-in reminder',
        '',
        `👤 Guest: ${payload.guestName}`,
        `📞 Phone: ${payload.phone}`,
        `🛏️ Room: ${payload.roomNumber}`,
        '',
        `📅 Check-in: ${this.formatDate(payload.checkInDate)}`,
        `📅 Check-out: ${this.formatDate(payload.checkOutDate)}`,
      ].join('\n'),
      body: `Reminder for ${payload.guestName}: check-in for room ${payload.roomNumber} is on ${this.formatDate(
        payload.checkInDate,
      )}.`,
    });
  }

  private async safeSend(message: WhatsAppMessage) {
    try {
      await this.sendMessage(message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown notification error';
      this.logger.error(
        `${this.provider} ${message.template} failed for ${message.to}: ${messageText}`,
      );
      throw error;
    }
  }

  private async sendMessage(message: WhatsAppMessage) {
    if (this.provider === 'cloud_api') {
      await this.sendCloudApiMessage(message);
      return;
    }

    if (this.provider === 'telegram') {
      await this.sendTelegramMessage(message);
      return;
    }

    this.logger.log(
      `[mock-whatsapp] ${message.template} to ${message.to}: ${message.body}${
        message.buttons?.length ? ` buttons=${message.buttons.map((button) => button.title).join(', ')}` : ''
      }`,
    );
  }

  private async sendCloudApiMessage(message: WhatsAppMessage) {
    const accessToken = process.env.WABA_ACCESS_TOKEN;
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const apiVersion = process.env.WABA_API_VERSION ?? 'v20.0';

    if (!accessToken || !phoneNumberId) {
      throw new Error('WABA_ACCESS_TOKEN and WABA_PHONE_NUMBER_ID are required when WHATSAPP_PROVIDER=cloud_api');
    }

    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.toCloudApiPayload(message)),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cloud API returned ${response.status}: ${body}`);
    }
  }

  private toCloudApiPayload(message: WhatsAppMessage) {
    const to = this.normalizePhone(message.to);

    if (message.buttons?.length) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: message.body,
          },
          action: {
            buttons: message.buttons.slice(0, 3).map((button) => ({
              type: 'reply',
              reply: {
                id: button.id,
                title: button.title.slice(0, 20),
              },
            })),
          },
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: message.body,
      },
    };
  }

  private normalizePhone(phone: string) {
    return phone.replace(/[^\d]/g, '');
  }

  private async sendTelegramMessage(message: WhatsAppMessage) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatIds = this.telegramChatIdsFor(message.template);

    if (!botToken || chatIds.length === 0) {
      throw new Error('TELEGRAM_BOT_TOKEN and a Telegram chat id are required when NOTIFICATION_PROVIDER=telegram');
    }

    const text = message.telegramText ?? message.body;

    for (const chatId of chatIds) {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API returned ${response.status} for chat ${chatId}: ${body}`);
      }
    }
  }

  private telegramChatIdsFor(template: string) {
    if (template === 'owner_reservation_notification' || template === 'owner_reservation_modified' || template === 'owner_reservation_cancelled') {
      return this.parseTelegramChatIds(process.env.TELEGRAM_OWNER_CHAT_IDS || process.env.TELEGRAM_OWNER_CHAT_ID || process.env.TELEGRAM_DEFAULT_CHAT_ID);
    }

    if (template === 'reservation_confirmation' || template === 'check_in_reminder') {
      return this.parseTelegramChatIds(process.env.TELEGRAM_GUEST_CHAT_IDS || process.env.TELEGRAM_GUEST_CHAT_ID || process.env.TELEGRAM_DEFAULT_CHAT_ID);
    }

    return this.parseTelegramChatIds(process.env.TELEGRAM_DEFAULT_CHAT_ID);
  }

  private parseTelegramChatIds(value: string | undefined) {
    return (value ?? '')
      .split(',')
      .map((chatId) => chatId.trim())
      .filter((chatId) => chatId.length > 0);
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
