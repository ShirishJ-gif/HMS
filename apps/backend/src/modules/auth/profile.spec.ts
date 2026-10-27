import { ValidationPipe } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (value: unknown, metatype: any) => pipe.transform(value, { type: 'body', metatype });

describe('Profile input validation', () => {
  it('normalizes personal details and accepts clearing optional preferences', async () => {
    await expect(validate({ name: '  Alice  ', phone: ' ', default_property_id: null }, UpdateProfileDto))
      .resolves.toMatchObject({ name: 'Alice', phone: null, default_property_id: null });
  });
  it.each([{ name: ' ' }, { name: null }, { role: 'PLATFORM_OWNER' }, { email: 'new@example.test' }, { property_id: 'other' }, { phone: 'invalid' }, { phone: '------' }, { default_property_id: 'invalid' }])('rejects invalid or privileged input %j', async input => {
    await expect(validate(input, UpdateProfileDto)).rejects.toThrow();
  });
  it.each([{ current_password: '', new_password: 'ValidPassword123' }, { current_password: 'old', new_password: 'short' }, { current_password: 'old', new_password: 'a'.repeat(129) }])('rejects invalid passwords %j', async input => {
    await expect(validate(input, ChangePasswordDto)).rejects.toThrow();
  });
});

describe('Credential version enforcement', () => {
  function setup(version: number, tokenVersion?: number, isActive = true) {
    const request: any = { headers: { authorization: 'Bearer test' } };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ isActive, tokenVersion: version, email: 'current@example.test', role: 'STAFF', propertyId: 'assigned', organizationId: 'org' }) } };
    const guard = new AuthGuard({ getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never,
      { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user', role: 'PLATFORM_OWNER', token_version: tokenVersion }) } as never,
      prisma as never, { attachAuthenticatedUser: jest.fn() } as never);
    const context = { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) } as never;
    return { guard, context, request };
  }
  it('accepts a legacy token only while the original credential version remains valid', async () => {
    const { guard, context, request } = setup(0);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ role: 'STAFF', property_id: 'assigned', property_ids: ['assigned'] });
  });
  it('rejects old access tokens after a password change', async () => {
    const { guard, context } = setup(1, 0);
    await expect(guard.canActivate(context)).rejects.toThrow('Session expired');
  });
  it('accepts the new session', async () => {
    const { guard, context } = setup(1, 1);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
  it('rejects inactive accounts', async () => {
    const { guard, context } = setup(0, 0, false);
    await expect(guard.canActivate(context)).rejects.toThrow('Session expired');
  });
});
