export type WhatsAppConnectionStatus =
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'QR_REQUIRED'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'LOGGED_OUT'
  | 'ERROR';

export type WhatsAppConnection = {
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  phoneE164: string | null;
  displayName: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  qrDataUrl?: string | null;
};

export type WhatsAppConversation = {
  id: string;
  displayName: string | null;
  phoneE164: string | null;
  remoteJid: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  guest: { id: string; name: string; phone: string; email: string | null } | null;
  reservation: {
    id: string;
    code: string;
    source: string | null;
    status: string;
    room: string | null;
    checkIn: string | null;
    checkOut: string | null;
  } | null;
};

export type WhatsAppMessage = {
  id: string;
  whatsappMessageId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  type: string;
  status: string;
  body: string | null;
  fromMe: boolean;
  whatsappTimestamp: string;
  receivedAt: string;
};
