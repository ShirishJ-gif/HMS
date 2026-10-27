import { PropertyType } from '@prisma/client';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { SignupPropertyDto } from '../auth/dto/signup-property.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyService } from './property.service';
import { AuthenticatedUser } from '../auth/auth.guard';
jest.mock('./villa-inventory', () => ({ ensureVillaInventory: jest.fn().mockResolvedValue({}) }));

describe('Property type', () => {
  const property = {
    id: 'property-1', name: 'Test villa', code: 'VILLA',
    propertyType: PropertyType.RENTAL_VILLAS,
    phone: null, email: null, address: 'Test address', timezone: 'Asia/Kolkata',
    defaultCheckInTime: '12:00', defaultCheckOutTime: '11:00', isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  };

  it.each([PropertyType.HOTEL, PropertyType.RENTAL_VILLAS])('persists and returns %s on creation', async propertyType => {
    const create = jest.fn().mockResolvedValue({ ...property, propertyType });
    const db = { property: { create }, auditLog: { create: jest.fn() } };
    const service = new PropertyService({ ...db, $transaction: (callback: (tx: unknown) => unknown) => callback(db) } as unknown as PrismaService);
    const response = await service.createProperty({ name: property.name, code: property.code, address: property.address, property_type: propertyType });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ propertyType }) });
    expect(response.property_type).toBe(propertyType);
  });

  it('saves the initial villa nightly rate with the property', async () => {
    const create = jest.fn().mockResolvedValue(property);
    const db = { property: { create }, auditLog: { create: jest.fn() } };
    const service = new PropertyService({ ...db, $transaction: (callback: (tx: unknown) => unknown) => callback(db) } as unknown as PrismaService);
    await service.createProperty({ name: property.name, code: property.code, address: property.address, property_type: PropertyType.RENTAL_VILLAS, nightly_rate: 4500 });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ villaWholeRate: 4500 }) });
  });

  it('records property creation under the new property and the organization owner who saved it', async () => {
    const owner: AuthenticatedUser = { sub: 'owner-1', email: 'owner@example.test', role: 'ORG_OWNER', organization_id: 'organization-1', property_id: 'old-property' };
    const saved = { ...property, organizationId: owner.organization_id };
    const tx = { property: { create: jest.fn().mockResolvedValue(saved) }, auditLog: { create: jest.fn() } };
    const service = new PropertyService({ $transaction: (work: (db: unknown) => unknown) => work(tx) } as unknown as PrismaService);
    await service.createProperty({ name: property.name, code: property.code, address: property.address }, owner);
    expect(tx.property.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: owner.organization_id }) });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'CREATE', entityType: 'property', entityId: property.id, propertyId: property.id, userId: owner.sub,
      summary: 'Created property "Test villa" (VILLA)', metadata: expect.objectContaining({ name: property.name, organization_id: owner.organization_id }),
    }) });
  });

  it.each([0, -1, 100000000, 12.345])('rejects invalid initial nightly rate %s', async nightly_rate => {
    const errors = await validate(Object.assign(new CreatePropertyDto(), { nightly_rate }));
    expect(errors.some(error => error.property === 'nightly_rate')).toBe(true);
  });

  it('updates the type without overwriting unrelated fields', async () => {
    const update = jest.fn().mockResolvedValue(property);
    const db = { property: { findUnique: jest.fn().mockResolvedValue({ id: property.id }), update } };
    const service = new PropertyService({ ...db, $transaction: (callback: (tx: unknown) => unknown) => callback(db) } as unknown as PrismaService);
    const response = await service.updateProperty(property.id, { property_type: PropertyType.RENTAL_VILLAS });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: property.id }, data: expect.objectContaining({ propertyType: PropertyType.RENTAL_VILLAS, name: undefined }) }));
    expect(response.property_type).toBe(PropertyType.RENTAL_VILLAS);
  });

  describe.each([CreatePropertyDto, UpdatePropertyDto, SignupPropertyDto])('%p validation', Dto => {
    it.each(['HOTEL', 'RENTAL_VILLAS', undefined])('accepts %s for compatibility', async property_type => {
      const errors = await validate(Object.assign(new Dto(), { property_type }));
      expect(errors.filter(error => error.property === 'property_type')).toEqual([]);
    });

    it('rejects unsupported types', async () => {
      const errors = await validate(Object.assign(new Dto(), { property_type: 'APARTMENT' }));
      expect(errors.some(error => error.property === 'property_type')).toBe(true);
    });
  });
});
