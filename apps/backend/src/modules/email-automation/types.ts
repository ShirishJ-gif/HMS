import {
  AutomationDecision,
  EmailCategory,
  EmailProviderType,
  EmailSource,
  ParserType,
} from '@prisma/client';

export type EmailAddress = {
  name?: string;
  email: string;
};

export type NormalizedAttachmentMetadata = {
  providerAttachmentId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  sha256?: string;
};

export type NormalizedProviderEmail = {
  providerMessageId: string;
  providerThreadId?: string;
  internetMessageId?: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  receivedAt: Date;
  sentAt?: Date;
  plainText?: string;
  html?: string;
  attachments: NormalizedAttachmentMetadata[];
  headers: Record<string, string | undefined>;
};

export type EmailConnectionHealth = {
  healthy: boolean;
  provider: EmailProviderType;
  status: string;
  reason?: string;
};

export type ProviderSyncResult = {
  providerMessageIds: string[];
  nextCursor?: string;
};

export type ParsedEmailEvent = {
  source: EmailSource;
  category: EmailCategory;
  confidence: number;
  parserType: ParserType;
  parserVersion: string;
  externalReservationId?: string | null;
  guest?: {
    name?: string | null;
    email?: string | null;
    phoneRaw?: string | null;
    phoneE164?: string | null;
  };
  stay?: {
    checkIn?: string | null;
    checkOut?: string | null;
    adults?: number | null;
    children?: number | null;
    infants?: number | null;
  };
  room?: {
    externalName?: string | null;
    externalRatePlanName?: string | null;
  };
  financial?: {
    currency?: string | null;
    total?: number | null;
    tax?: number | null;
    roomFee?: number | null;
    guestServiceFee?: number | null;
    occupancyTaxes?: number | null;
    hostServiceFee?: number | null;
    hostPayout?: number | null;
    payoutAmount?: number | null;
    payoutSentDate?: string | null;
    payoutArrivalDate?: string | null;
    bankAccount?: string | null;
    airbnbAccountId?: string | null;
    taxWithholding?: number | null;
  };
  cancellation?: {
    reason?: string | null;
  };
  evidence?: Record<string, unknown>;
};

export type ParserMatch = {
  matched: boolean;
  confidence: number;
};

export type ReservationResolution =
  | { type: 'EXISTING'; reservationId: string; reason: string }
  | { type: 'NEW'; reason: string }
  | { type: 'AMBIGUOUS'; candidates: string[]; reason: string }
  | { type: 'NOT_APPLICABLE'; reason: string };

export type AutomationDecisionResult = {
  decision: AutomationDecision;
  reasonCodes: string[];
  automationConfidence: number;
};
