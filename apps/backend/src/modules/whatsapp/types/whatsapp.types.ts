import type { AuthenticatedUser } from '../../auth/auth.guard';

export type WhatsAppSocketUser = AuthenticatedUser & {
  socketId: string;
  allowedPropertyIds: string[] | null;
};

export type WhatsAppConnectionSnapshot = {
  status: string;
  phoneNumber: string | null;
  phoneE164: string | null;
  displayName: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type NormalizedWhatsAppMessage = {
  whatsappMessageId: string;
  remoteJid: string;
  remoteJidAlt: string | null;
  fromMe: boolean;
  body: string | null;
  rawType: string | null;
  timestamp: Date;
};
