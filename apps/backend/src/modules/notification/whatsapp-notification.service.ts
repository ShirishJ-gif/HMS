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

type WhatsAppMessage = {
  to: string;
  template: string;
  body: string;
  buttons?: Array<{ id: string; title: string }>;
};

type WhatsAppProvider = 'mock' | 'cloud_api';

@Injectable()
export class WhatsAppNotificationService {
  private readonly logger = new Logger(WhatsAppNotificationService.name);
  private readonly provider = (process.env.WHATSAPP_PROVIDER ?? 'mock') as WhatsAppProvider;

  async sendReservationConfirmation(payload: ReservationConfirmationPayload) {
    await this.safeSend({
      to: payload.phone,
      template: 'reservation_confirmation',
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

  async sendCheckInReminder(payload: CheckInReminderPayload) {
    await this.safeSend({
      to: payload.phone,
      template: 'check_in_reminder',
      body: `Reminder for ${payload.guestName}: check-in for room ${payload.roomNumber} is on ${this.formatDate(
        payload.checkInDate,
      )}.`,
    });
  }

  private async safeSend(message: WhatsAppMessage) {
    try {
      await this.sendMessage(message);
    } catch (error) {
      this.logger.error(
        `WhatsApp ${message.template} failed for ${message.to}: ${
          error instanceof Error ? error.message : 'Unknown notification error'
        }`,
      );
    }
  }

  private async sendMessage(message: WhatsAppMessage) {
    if (this.provider === 'cloud_api') {
      await this.sendCloudApiMessage(message);
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

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
