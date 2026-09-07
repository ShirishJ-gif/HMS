import type { WAMessage } from '@whiskeysockets/baileys';
import { NormalizedWhatsAppMessage } from '../types/whatsapp.types';

export function normalizeBaileysMessage(message: WAMessage): NormalizedWhatsAppMessage | null {
  const key = message.key;
  const whatsappMessageId = key.id;
  const remoteJid = key.remoteJid;
  if (!whatsappMessageId || !remoteJid || remoteJid === 'status@broadcast') return null;

  const content = unwrapMessageContent(message.message);
  const rawType = content ? Object.keys(content)[0] ?? null : null;
  const body =
    content?.conversation ??
    content?.extendedTextMessage?.text ??
    content?.imageMessage?.caption ??
    content?.videoMessage?.caption ??
    null;
  const timestampValue = Number(message.messageTimestamp ?? Date.now() / 1000);

  return {
    whatsappMessageId,
    remoteJid,
    remoteJidAlt: key.remoteJidAlt ?? null,
    fromMe: Boolean(key.fromMe),
    body,
    rawType,
    timestamp: new Date(timestampValue * 1000),
  };
}

function unwrapMessageContent(content: WAMessage['message']): WAMessage['message'] {
  let current = content;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    current =
      current.ephemeralMessage?.message ??
      current.viewOnceMessage?.message ??
      current.viewOnceMessageV2?.message ??
      current.viewOnceMessageV2Extension?.message ??
      current.documentWithCaptionMessage?.message ??
      current.editedMessage?.message ??
      current.deviceSentMessage?.message ??
      current;
    if (current === content) break;
    content = current;
  }
  return current;
}
