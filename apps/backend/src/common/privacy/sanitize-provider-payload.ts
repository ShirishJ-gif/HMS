import { Prisma } from '@prisma/client';

const confidentialIdentityKeyPatterns = [
  /aadhaar/i,
  /aadhar/i,
  /passport/i,
  /driver.*licen[cs]e/i,
  /driving.*licen[cs]e/i,
  /national.*id/i,
  /government.*id/i,
  /identity.*document/i,
  /id.*proof/i,
  /proof.*id/i,
  /document.*number/i,
  /document.*no/i,
  /identity.*number/i,
  /license.*number/i,
  /licence.*number/i,
  /pan.*card/i,
];

export function sanitizeProviderPayload(value: unknown): Prisma.InputJsonValue {
  return sanitizeJsonValue(value) as Prisma.InputJsonValue;
}

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isConfidentialIdentityKey(key))
        .map(([key, nestedValue]) => [key, sanitizeJsonValue(nestedValue)]),
    );
  }

  return value ?? null;
}

function isConfidentialIdentityKey(key: string) {
  const normalized = key.replace(/[_-]+/g, ' ');
  return confidentialIdentityKeyPatterns.some((pattern) => pattern.test(normalized));
}
