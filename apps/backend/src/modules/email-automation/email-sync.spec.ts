import { EmailAutomationService } from './email-automation.service';

describe('Email sync run filters', () => {
  function setup() {
    const connection = {
      id: 'connection', propertyId: 'property', property: { organizationId: 'organization' },
      status: 'CONNECTED', provider: 'GMAIL', encryptedCredential: Buffer.from('credential'),
      providerCursor: '2026-09-01T00:00:00.000Z',
      trustedFromEmail: 'saved@example.com', trustedSubject: 'Saved subject',
    };
    const provider = {
      listMessageIds: jest.fn().mockResolvedValue({ ids: ['existing', 'new'], nextCursor: 'next-cursor' }),
      fetchMessage: jest.fn().mockResolvedValue({ subject: 'Test' }),
    };
    const service = Object.create(EmailAutomationService.prototype);
    service.prisma = {
      emailConnection: { findUnique: jest.fn().mockResolvedValue(connection), update: jest.fn().mockResolvedValue({}) },
      incomingEmail: { findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(
        where.connectionId_providerMessageId.providerMessageId === 'existing' ? { id: 'existing' } : null,
      )) },
    };
    service.credentialEncryptionService = { decrypt: jest.fn().mockReturnValue({ access_token: 'test' }) };
    service.provider = jest.fn().mockReturnValue(provider);
    service.persistProviderEmail = jest.fn().mockResolvedValue({ id: 'new-email' });
    service.processEmail = jest.fn().mockResolvedValue({ status: 'PROCESSED' });
    return { service, provider, connection };
  }

  it('applies run filters and processes only new emails without advancing the scheduled cursor', async () => {
    const { service, provider } = setup();
    const result = await service.syncConnection('connection', { backfillHours: 24, fromEmail: 'test@example.com', subject: 'Booking' });
    expect(provider.listMessageIds).toHaveBeenCalledWith(expect.anything(), expect.any(String), { fromEmail: 'test@example.com', subject: 'Booking' });
    expect(result).toMatchObject({ fetched: 2, new_emails: 1, processed: 1, duplicates: 1 });
    expect(service.processEmail).toHaveBeenCalledTimes(1);
    const data = service.prisma.emailConnection.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('providerCursor');
    expect(data).not.toHaveProperty('trustedFromEmail');
    expect(data).not.toHaveProperty('trustedSubject');
  });

  it('allows empty run filters to fetch across all senders and subjects', async () => {
    const { service, provider } = setup();
    await service.syncConnection('connection', { fromEmail: '', subject: '', backfillHours: 72 });
    expect(provider.listMessageIds).toHaveBeenCalledWith(expect.anything(), expect.any(String), { fromEmail: '', subject: '' });
  });

  it('keeps normal sync using saved filters and advancing its cursor', async () => {
    const { service, provider, connection } = setup();
    await service.syncConnection('connection');
    expect(provider.listMessageIds).toHaveBeenCalledWith(expect.anything(), connection.providerCursor, { fromEmail: connection.trustedFromEmail, subject: connection.trustedSubject });
    expect(service.prisma.emailConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ providerCursor: 'next-cursor' }) }));
  });

  it('reports a processing failure instead of counting it as processed', async () => {
    const { service } = setup();
    service.processEmail.mockResolvedValue({ status: 'FAILED', last_error_message: 'Invalid stay dates' });
    const result = await service.syncConnection('connection');
    expect(result).toMatchObject({ fetched: 2, new_emails: 1, processed: 0, duplicates: 1, failed: 1 });
    expect(result.failures).toEqual([{ email_id: 'new-email', subject: 'Test', message: 'Invalid stay dates' }]);
  });

  it('continues after a failed email and distinguishes review and ignored outcomes', async () => {
    const { service, provider } = setup();
    provider.listMessageIds.mockResolvedValue({ ids: ['ignored', 'review', 'failed'], nextCursor: 'next-cursor' });
    service.processEmail
      .mockResolvedValueOnce({ status: 'FAILED', last_error_message: 'Parser failed' })
      .mockResolvedValueOnce({ status: 'NEEDS_REVIEW' })
      .mockResolvedValueOnce({ status: 'IGNORED' });
    const result = await service.syncConnection('connection');
    expect(result).toMatchObject({ fetched: 3, new_emails: 3, processed: 2, duplicates: 0, failed: 1, needs_review: 1, ignored: 1 });
    expect(service.processEmail).toHaveBeenCalledTimes(3);
  });
});
