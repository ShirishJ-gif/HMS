import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmailAutomationService } from './email-automation.service';
import { EmailActivityQueryDto } from './dto/email-activity-query.dto';

describe('Email activity visibility and filters', () => {
  function setup() {
    const rows = [{ id: 'ordinary-test', status: 'IGNORED', extraction: null }, { id: 'failed', status: 'FAILED', extraction: null }];
    const service = Object.create(EmailAutomationService.prototype) as EmailAutomationService;
    const db = {
      incomingEmail: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(52) },
      $transaction: jest.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    Object.assign(service, { prisma: db, toEmailResponse: (row: unknown) => row });
    return { service, db, rows };
  }

  it('includes ordinary and failed emails without requiring a booking extraction', async () => {
    const { service, db, rows } = setup();
    const result = await service.listActivity('property', new EmailActivityQueryDto());
    expect(db.incomingEmail.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { propertyId: 'property' } }));
    expect(db.incomingEmail.count).toHaveBeenCalledWith({ where: { propertyId: 'property' } });
    expect(result.data).toEqual(rows);
    expect(result.meta.total).toBe(52);
  });

  it('requires both sender and subject to match their own fields', async () => {
    const { service, db } = setup();
    await service.listActivity('property', Object.assign(new EmailActivityQueryDto(), { from_email: ' sender@example.com ', subject: ' Leave request ' }));
    expect(db.incomingEmail.findMany.mock.calls[0][0].where).toEqual({
      propertyId: 'property',
      fromEmail: { contains: 'sender@example.com', mode: 'insensitive' },
      subject: { contains: 'Leave request', mode: 'insensitive' },
    });
  });

  it('combines status and date filters while paging all matching messages', async () => {
    const { service, db } = setup();
    await service.listActivity('property', Object.assign(new EmailActivityQueryDto(), { status: 'IGNORED', received_after: '2026-09-28T10:00:00Z', page: 2, limit: 25 }));
    expect(db.incomingEmail.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { propertyId: 'property', status: 'IGNORED', receivedAt: { gte: new Date('2026-09-28T10:00:00Z') } },
      skip: 25, take: 25,
    }));
    expect(db.incomingEmail.count.mock.calls[0][0].where).toEqual(db.incomingEmail.findMany.mock.calls[0][0].where);
  });

  it('ignores blank field filters and preserves optional general search for other clients', async () => {
    const { service, db } = setup();
    await service.listActivity('property', Object.assign(new EmailActivityQueryDto(), { from_email: ' ', subject: ' ', search: 'guest' }));
    const where = db.incomingEmail.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('fromEmail');
    expect(where).not.toHaveProperty('subject');
    expect(where.AND[0].OR).toContainEqual({ extraction: { guestName: { contains: 'guest', mode: 'insensitive' } } });
  });

  it('accepts the separate query parameters and rejects invalid date ranges', async () => {
    const valid = plainToInstance(EmailActivityQueryDto, { from_email: 'sender@example.com', subject: 'Test', received_after: '2026-09-28T10:00:00Z', page: '2' });
    expect(await validate(valid, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(await validate(Object.assign(new EmailActivityQueryDto(), { received_after: 'bad-date' }))).toHaveLength(1);
  });
});
