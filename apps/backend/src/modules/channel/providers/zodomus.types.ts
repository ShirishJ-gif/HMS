import { BadRequestException } from '@nestjs/common';

export type ZodomusEnvironment = 'sandbox' | 'production';
export type ZodomusOtaKey = 'BOOKING_COM' | 'EXPEDIA' | 'AIRBNB';

export type ZodomusAppCredentials = {
  api_user: string;
  api_password: string;
  credit_card_api_password?: string;
  environment: ZodomusEnvironment;
};

export type ZodomusConnectionConfig = {
  channel_code: string;
  ota_key: ZodomusOtaKey;
  ota_name: string;
};

const ZODOMUS_OTA_CONFIG: Record<ZodomusOtaKey, { channel_code: string; ota_name: string }> = {
  BOOKING_COM: { channel_code: '1', ota_name: 'Booking.com' },
  EXPEDIA: { channel_code: '2', ota_name: 'Expedia' },
  AIRBNB: { channel_code: '3', ota_name: 'Airbnb' },
};

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function assertEnvironment(value: string): asserts value is ZodomusEnvironment {
  if (value !== 'sandbox' && value !== 'production') {
    throw new BadRequestException('Zodomus environment must be either sandbox or production.');
  }
}

export function readZodomusAppCredentials(env: NodeJS.ProcessEnv = process.env): ZodomusAppCredentials {
  const apiUser = env.ZODOMUS_API_USER?.trim() ?? '';
  const apiPassword = env.ZODOMUS_API_PASSWORD?.trim() ?? '';
  const environment = env.ZODOMUS_ENVIRONMENT?.trim() ?? '';

  if (!apiUser || !apiPassword || !environment) {
    throw new BadRequestException(
      'Zodomus env configuration is incomplete. Set ZODOMUS_API_USER, ZODOMUS_API_PASSWORD, and ZODOMUS_ENVIRONMENT on the backend.',
    );
  }

  assertEnvironment(environment);

  return {
    api_user: apiUser,
    api_password: apiPassword,
    credit_card_api_password: env.ZODOMUS_CREDIT_CARD_API_PASSWORD?.trim() || undefined,
    environment,
  };
}

export function readZodomusConnectionConfig(value: unknown): ZodomusConnectionConfig {
  const record = asRecord(value);
  if (!record) {
    throw new BadRequestException(
      'Zodomus connection config is required and must include a supported ota_key or a numeric channel_code.',
    );
  }

  const otaKey = readStringField(record, 'ota_key');
  if (otaKey && otaKey in ZODOMUS_OTA_CONFIG) {
    const normalizedKey = otaKey as ZodomusOtaKey;
    return {
      ota_key: normalizedKey,
      ...ZODOMUS_OTA_CONFIG[normalizedKey],
    };
  }

  const channelCode = readStringField(record, 'channel_code');
  if (!/^\d+$/.test(channelCode)) {
    throw new BadRequestException('Zodomus channelId must be a numeric string, for example "1".');
  }

  const matchedEntry = Object.entries(ZODOMUS_OTA_CONFIG).find(
    ([, config]) => config.channel_code === channelCode,
  );

  if (matchedEntry) {
    const [matchedKey, config] = matchedEntry as [ZodomusOtaKey, { channel_code: string; ota_name: string }];
    return {
      ota_key: matchedKey,
      ...config,
    };
  }

  throw new BadRequestException(
    'Unsupported Zodomus channelId for the guided setup. Supported channels are 1=Booking.com, 2=Expedia, 3=Airbnb.',
  );
}
