import { Logger } from '@nestjs/common';
import { ReservationNotificationService } from './reservation-notification.service';

describe('ReservationNotificationService', () => {
  const originalEnv = process.env;
  const confirmation = {
    guestName: 'Test Guest', phone: '+919000000000', roomNumber: '101',
    checkInDate: new Date('2026-09-24'), checkOutDate: new Date('2026-09-25'),
  };

  beforeEach(() => {
    process.env = { ...originalEnv, NOTIFICATION_PROVIDER: 'mock' };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('does not send externally with retired WhatsApp configuration', async () => {
    process.env.NOTIFICATION_PROVIDER = 'cloud_api';
    process.env.WHATSAPP_PROVIDER = 'cloud_api';
    process.env.WABA_ACCESS_TOKEN = 'unused-test-token';
    process.env.WABA_PHONE_NUMBER_ID = 'unused-test-phone';
    await new ReservationNotificationService().sendReservationConfirmation(confirmation);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('continues sending reservation confirmations through Telegram', async () => {
    process.env.NOTIFICATION_PROVIDER = 'telegram';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_GUEST_CHAT_IDS = 'test-guest-chat';
    await new ReservationNotificationService().sendReservationConfirmation(confirmation);
    expect(fetch).toHaveBeenCalledWith('https://api.telegram.org/bottest-bot-token/sendMessage', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('test-guest-chat'),
    }));
  });

  it('keeps delivery failures available for background-job retries', async () => {
    process.env.NOTIFICATION_PROVIDER = 'telegram';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_GUEST_CHAT_IDS = 'test-guest-chat';
    jest.mocked(fetch).mockRejectedValue(new Error('Temporary connection failure'));
    await expect(new ReservationNotificationService().sendCheckInReminder(confirmation)).rejects.toThrow('Temporary connection failure');
  });
});
