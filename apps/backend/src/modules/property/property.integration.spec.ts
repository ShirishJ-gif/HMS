import '../../common/env/load-env';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PropertyService } from './property.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';

const integration = process.env.RUN_PROPERTY_INTEGRATION === 'true' ? describe : describe.skip;

integration('Property creation visibility (rolled back)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  it('lists a newly created property and its audit event for its organization owner only', async () => {
    const rollback = new Error('rollback property test');
    await expect(prisma.$transaction(async tx => {
      const organization = await tx.organization.create({ data: { name: 'Property visibility test' } });
      const staff = await tx.user.create({ data: { name: 'Test owner', email: `${randomUUID()}@example.test`, role: 'ORG_OWNER', organizationId: organization.id, passwordHash: 'test' } });
      const user: AuthenticatedUser = { sub: staff.id, email: staff.email, role: 'ORG_OWNER', organization_id: organization.id, property_id: null, property_ids: [] };
      const db = new Proxy(tx, { get: (target, key) => key === '$transaction'
        ? async (input: unknown) => typeof input === 'function' ? input(tx) : Promise.all(input as Promise<unknown>[])
        : Reflect.get(target, key) });
      const service = new PropertyService(db as never);
      const audit = new AuditLogService(db as never);
      const saved = await service.createProperty({ name: 'New property', code: randomUUID(), address: 'Test address' }, user);
      // AuthGuard refreshes these IDs from the organization on each request.
      user.property_ids = (await tx.property.findMany({ where: { organizationId: organization.id }, select: { id: true } })).map(property => property.id);
      expect((await service.findProperties({ page: 1, limit: 25 }, user)).data.map(property => property.id)).toEqual([saved.id]);
      expect((await service.getSetupWorkspace(user)).properties.map(property => property.id)).toEqual([saved.id]);
      const events = (await audit.findAll({ page: 1, limit: 25 }, user)).data;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ action: 'CREATE', entity_type: 'property', entity_id: saved.id, property_id: saved.id, user_id: user.sub, user: { name: 'Test owner' }, summary: `Created property "New property" (${saved.code})` });
      const outsider = { ...user, role: 'ADMIN' as const, property_id: randomUUID() };
      expect((await service.findProperties({ page: 1, limit: 25 }, outsider)).data).toHaveLength(0);
      expect((await audit.findAll({ page: 1, limit: 25 }, outsider)).data).toHaveLength(0);
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  });
});
