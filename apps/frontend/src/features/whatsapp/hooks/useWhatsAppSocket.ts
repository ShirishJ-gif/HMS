import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { api } from '../../../api/client';
import { getStoredAccessToken } from '../../../api/session';
import { WhatsAppConversation, WhatsAppMessage } from '../types';

type Handlers = {
  onConnectionState?: (state: { status: string }) => void;
  onQr?: (payload: { qrDataUrl: string; generatedAt: string }) => void;
  onMessageNew?: (payload: { conversation: WhatsAppConversation; message: WhatsAppMessage }) => void;
  onMessageUpdated?: (message: WhatsAppMessage) => void;
  onConversationUpdated?: (conversation: WhatsAppConversation) => void;
};

export function useWhatsAppSocket(propertyId: string, handlers: Handlers) {
  useEffect(() => {
    if (!propertyId) return;
    const token = getStoredAccessToken();
    if (!token) return;

    const baseUrl = String(api.defaults.baseURL ?? '').replace(/\/$/, '');
    const socket = io(`${baseUrl}/whatsapp`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      socket.emit('whatsapp.subscribe', { propertyId });
    });
    socket.on('whatsapp.connection.state', handlers.onConnectionState ?? (() => undefined));
    socket.on('whatsapp.qr', handlers.onQr ?? (() => undefined));
    socket.on('whatsapp.message.new', handlers.onMessageNew ?? (() => undefined));
    socket.on('whatsapp.message.updated', handlers.onMessageUpdated ?? (() => undefined));
    socket.on('whatsapp.conversation.updated', handlers.onConversationUpdated ?? (() => undefined));

    return () => {
      socket.disconnect();
    };
  }, [propertyId]);
}
