import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhone(value: string | null | undefined, defaultCountry: 'IN' | 'US' = 'IN') {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const fromPlus = parsePhoneNumberFromString(trimmed);
  if (fromPlus?.isValid()) return fromPlus.number;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  const parsed = parsePhoneNumberFromString(digits, defaultCountry);
  if (parsed?.isValid()) return parsed.number;

  if (digits.length === 10 && defaultCountry === 'IN') {
    const indian = parsePhoneNumberFromString(`+91${digits}`);
    if (indian?.isValid()) return indian.number;
  }

  return `+${digits}`;
}

export function phoneFromWhatsAppJid(jid: string) {
  const normalizedJid = normalizePhoneJid(jid);
  if (!normalizedJid || !isPhoneJid(normalizedJid)) return null;
  const user = normalizedJid.split('@')[0]?.split(':')[0];
  return normalizePhone(user);
}

export function isPhoneJid(jid: string | null | undefined) {
  return Boolean(jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us')));
}

export function isLidJid(jid: string | null | undefined) {
  return Boolean(jid && jid.endsWith('@lid'));
}

export function displayableJid(jid: string) {
  if (isLidJid(jid)) return null;
  return jid;
}

export function normalizePhoneJid(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || isLidJid(trimmed)) return null;
  if (isPhoneJid(trimmed)) return trimmed;
  if (trimmed.includes('@')) return null;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
}

export function normalizeLidJid(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (isLidJid(trimmed)) return trimmed;
  if (trimmed.includes('@')) return null;
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${digits}@lid` : null;
}
