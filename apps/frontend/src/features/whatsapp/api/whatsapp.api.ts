import { api } from '../../../api/client';
import { WhatsAppConnection, WhatsAppConversation, WhatsAppMessage } from '../types';

export function fetchWhatsAppConnection(propertyId: string) {
  return api.get<WhatsAppConnection>(`/properties/${propertyId}/whatsapp/connection`).then((res) => res.data);
}

export function startWhatsAppConnection(propertyId: string) {
  return api.post<WhatsAppConnection>(`/properties/${propertyId}/whatsapp/connection/start`).then((res) => res.data);
}

export function stopWhatsAppConnection(propertyId: string) {
  return api.post<WhatsAppConnection>(`/properties/${propertyId}/whatsapp/connection/stop`).then((res) => res.data);
}

export function disconnectWhatsApp(propertyId: string) {
  return api.delete<WhatsAppConnection>(`/properties/${propertyId}/whatsapp/connection`).then((res) => res.data);
}

export function fetchWhatsAppConversations(propertyId: string, search = '') {
  return api
    .get<{ items: WhatsAppConversation[]; nextCursor: string | null }>(`/properties/${propertyId}/whatsapp/conversations`, {
      params: { limit: 50, search: search || undefined },
    })
    .then((res) => res.data);
}

export function fetchWhatsAppMessages(propertyId: string, conversationId: string) {
  return api
    .get<{ items: WhatsAppMessage[]; nextCursor: string | null }>(
      `/properties/${propertyId}/whatsapp/conversations/${conversationId}/messages`,
      { params: { limit: 80 } },
    )
    .then((res) => res.data);
}

export function sendWhatsAppText(propertyId: string, conversationId: string, text: string) {
  return api
    .post<{ message: WhatsAppMessage }>(`/properties/${propertyId}/whatsapp/conversations/${conversationId}/messages`, {
      type: 'TEXT',
      text,
    })
    .then((res) => res.data.message);
}

export function markWhatsAppConversationRead(propertyId: string, conversationId: string) {
  return api
    .post<{ conversation: WhatsAppConversation }>(`/properties/${propertyId}/whatsapp/conversations/${conversationId}/read`)
    .then((res) => res.data.conversation);
}
