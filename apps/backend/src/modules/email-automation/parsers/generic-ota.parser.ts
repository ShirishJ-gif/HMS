import { EmailCategory, EmailSource, ParserType } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { KnownEmailParser } from './parser.interface';
import { NormalizedProviderEmail, ParsedEmailEvent } from '../types';

const sourceLabels: Record<EmailSource, string[]> = {
  BOOKING_COM: ['booking.com', 'booking-com'],
  AIRBNB: ['airbnb'],
  EXPEDIA: ['expedia', 'hotels.com'],
  MAKEMYTRIP: ['makemytrip', 'make my trip', 'mmt'],
  GOIBIBO: ['goibibo'],
  AGODA: ['agoda'],
  WEBSITE: ['website'],
  DIRECT_GUEST: [],
  OTHER: [],
  UNKNOWN: [],
};

export class GenericOtaParser implements KnownEmailParser {
  id: string;
  version: string;

  constructor(private readonly source: EmailSource) {
    this.id = `${source.toLowerCase().replace(/_/g, '-')}-deterministic`;
    this.version = `${this.id}@1`;
  }

  canParse(email: NormalizedProviderEmail) {
    const text = this.text(email).toLowerCase();
    const sourceMatch = sourceLabels[this.source].some((label) => text.includes(label));
    const bookingSignal = /(reservation|booking|confirmation)\s*(number|id|code|no|reference)?/i.test(text);
    const paymentSignal = /(payout|money was sent|total paid|bank account|earnings)/i.test(text);
    return {
      matched: sourceMatch && (bookingSignal || paymentSignal),
      confidence: sourceMatch && (bookingSignal || paymentSignal) ? 0.98 : 0,
    };
  }

  async parse(email: NormalizedProviderEmail): Promise<ParsedEmailEvent> {
    const text = this.text(email);
    const category = inferCategory(text);
    const checkIn = extractStayDate(text, ['check-in', 'check in', 'arrival', 'arrives'], 'checkin', email.receivedAt);
    const checkOut = extractStayDate(text, ['check-out', 'check out', 'checkout', 'departure', 'departs'], 'checkout', email.receivedAt);
    const phoneRaw = extractPhone(text);
    const phone = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'IN') : undefined;
    const financial = extractFinancial(text);

    return {
      source: this.source,
      category,
      confidence: category === EmailCategory.BOOKING_CONFIRMATION ? 0.98 : 0.94,
      parserType: ParserType.DETERMINISTIC,
      parserVersion: this.version,
      externalReservationId: extractReservationId(text),
      guest: {
        name: extractGuestName(text),
        email: extractGuestEmail(text, email.from.email),
        phoneRaw,
        phoneE164: phone?.isValid() ? phone.number : null,
      },
      stay: {
        checkIn,
        checkOut,
        adults: extractCount(text, ['adult', 'adults']),
        children: extractCount(text, ['child', 'children']),
      },
      room: {
        externalName: extractAirbnbPayoutListingName(text) ?? extractLabel(text, ['room type', 'room', 'accommodation']),
        externalRatePlanName: extractLabel(text, ['rate plan', 'meal plan']),
      },
      financial,
      cancellation: category === EmailCategory.BOOKING_CANCELLATION ? { reason: extractLabel(text, ['reason']) } : undefined,
      evidence: {
        parser: this.version,
        subject: email.subject,
      },
    };
  }

  private text(email: NormalizedProviderEmail) {
    return `${email.subject}\n${email.plainText ?? ''}`;
  }
}

export function parseDirectGuestEnquiry(email: NormalizedProviderEmail): ParsedEmailEvent {
  const text = `${email.subject}\n${email.plainText ?? ''}`;
  const checkIn = extractStayDate(text, ['check-in', 'check in', 'from', 'arrival'], 'checkin', email.receivedAt);
  const checkOut = extractStayDate(text, ['check-out', 'check out', 'to', 'departure'], 'checkout', email.receivedAt);
  const phoneRaw = extractPhone(text);
  const phone = phoneRaw ? parsePhoneNumberFromString(phoneRaw, 'IN') : undefined;

  return {
    source: EmailSource.DIRECT_GUEST,
    category: EmailCategory.BOOKING_ENQUIRY,
    confidence: checkIn || checkOut ? 0.88 : 0.76,
    parserType: ParserType.DETERMINISTIC,
    parserVersion: 'direct-guest-enquiry@1',
    guest: {
      name: extractGuestName(text) ?? email.from.name ?? null,
      email: extractAnyEmail(text) ?? email.from.email,
      phoneRaw,
      phoneE164: phone?.isValid() ? phone.number : null,
    },
    stay: {
      checkIn,
      checkOut,
      adults: extractCount(text, ['adult', 'adults']) ?? undefined,
      children: extractCount(text, ['child', 'children']) ?? undefined,
    },
    evidence: {
      parser: 'direct-guest-enquiry@1',
      subject: email.subject,
    },
  };
}

function inferCategory(text: string) {
  const subject = text.split('\n')[0] ?? '';
  if (/(payout|money was sent|total paid|bank account|earnings)/i.test(text)) {
    return EmailCategory.PAYMENT_NOTIFICATION;
  }
  if (/reservation confirmed|booking confirmed|new booking confirmed|confirmed\s*[-:]/i.test(subject) || /new booking confirmed!/i.test(text)) {
    return EmailCategory.BOOKING_CONFIRMATION;
  }
  if (/(reservation|booking).{0,80}(cancelled|canceled)|cancelled|canceled|cancellation confirmed|booking cancelled/i.test(subject)) {
    return EmailCategory.BOOKING_CANCELLATION;
  }
  if (/(reservation|booking).{0,80}(cancelled|canceled)|cancellation confirmed|booking cancelled/i.test(text)) {
    return EmailCategory.BOOKING_CANCELLATION;
  }
  if (/(modified|updated|changed|amended)/i.test(text)) return EmailCategory.BOOKING_MODIFICATION;
  return EmailCategory.BOOKING_CONFIRMATION;
}

function extractReservationId(text: string) {
  const payoutReservationId = extractAirbnbPayoutReservationId(text);
  if (payoutReservationId) return payoutReservationId;

  const airbnbUrlId = text.match(/\/hosting\/reservations\/details\/([A-Z0-9-]{5,})/i)?.[1];
  if (airbnbUrlId) return airbnbUrlId;

  return extractLabel(text, [
    'reservation number',
    'reservation no',
    'reservation id',
    'booking number',
    'booking id',
    'confirmation number',
    'confirmation code',
    'booking reference',
  ])?.match(/[A-Z0-9][A-Z0-9-]{3,}/i)?.[0] ?? null;
}

function extractGuestName(text: string) {
  const payoutGuestName = extractAirbnbPayoutGuestName(text);
  if (payoutGuestName) return payoutGuestName;

  const subjectName = text.match(/reservation confirmed\s*[-:]\s*(.+?)\s+arrives\b/i)?.[1];
  if (subjectName) return cleanLine(subjectName);

  const headlineName = text.match(/\bnew booking confirmed!\s+(.+?)\s+arrives\b/i)?.[1];
  if (headlineName) return titleCase(cleanLine(headlineName));

  return extractLabel(text, ['guest name', 'primary guest', 'booked by', 'customer name', 'guest']);
}

function extractGuestEmail(text: string, senderEmail: string) {
  const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
  return emails.find((email) => email.toLowerCase() !== senderEmail.toLowerCase() && !email.toLowerCase().endsWith('@airbnb.com')) ?? null;
}

function extractAnyEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

function extractPhone(text: string) {
  const labelled = text.match(/(?:phone|mobile|tel|contact)\s*[:#-]\s*([+()\d][+()\d\s.-]{7,})/i)?.[1];
  return cleanLine(labelled ?? '') || null;
}

function extractStayDate(text: string, labels: string[], role: 'checkin' | 'checkout', receivedAt: Date) {
  const payoutDate = extractAirbnbPayoutStayDate(text, role);
  if (payoutDate) return payoutDate;

  const airbnbTableDate = extractAirbnbDatePair(text, role, receivedAt);
  if (airbnbTableDate) return airbnbTableDate;

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*[:#-]?\\s*([^\\n]+)`, 'i'));
    const parsed = match?.[1] ? parseExplicitDate(match[1], receivedAt) : null;
    if (parsed) return parsed;
  }
  return null;
}

function extractAirbnbPayoutGuestName(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const detailsIndex = lines.findIndex((line) => line.toLowerCase() === 'details');
  if (detailsIndex >= 0) {
    const candidate = lines[detailsIndex + 1];
    if (candidate && !/[₹$€£]/.test(candidate)) return candidate;
  }
  const compact = compactText(text);
  const detailsMatch = compact.match(/\bDetails\s+(.+?)\s+(?:[₹$€£]\s*)?-?[\d,]+(?:\.\d{2})?\s*(?:INR|USD|EUR|GBP)?\b/i);
  if (detailsMatch?.[1]) return cleanLine(detailsMatch[1]);
  return null;
}

function extractAirbnbPayoutReservationId(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\([0-9]{8,}\)/.test(lines[index])) continue;
    const candidate = lines[index + 1];
    if (candidate && /^[A-Z0-9]{6,}$/i.test(candidate)) return candidate;
  }
  return compactText(text).match(/\([0-9]{8,}\)\s+([A-Z0-9]{6,})\b/i)?.[1] ?? null;
}

function extractAirbnbPayoutListingName(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  for (const line of lines) {
    const listingMatch = line.match(/^(.+?)\s+\([0-9]{8,}\)$/);
    if (listingMatch?.[1]) return cleanLine(listingMatch[1]);
  }
  const listingMatch = compactText(text).match(/\b(?:Home|Tax Withholding for India Income)\s+.\s+\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}\s+(.+?)\s+\([0-9]{8,}\)/i);
  return listingMatch?.[1] ? cleanLine(listingMatch[1]) : null;
}

function extractAirbnbPayoutStayDate(text: string, role: 'checkin' | 'checkout') {
  const range = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!range) return null;
  return role === 'checkin'
    ? toDateKey(Number(range[3]), Number(range[1]), Number(range[2]))
    : toDateKey(Number(range[6]), Number(range[4]), Number(range[5]));
}

function extractAirbnbDatePair(text: string, role: 'checkin' | 'checkout', receivedAt: Date) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /check-?in\s+checkout/i.test(line));
  if (headerIndex < 0) return null;

  for (let index = headerIndex + 1; index < Math.min(lines.length, headerIndex + 6); index += 1) {
    const line = lines[index];
    const pair = line.match(/\b(?:mon|tue|wed|thu|fri|sat|sun),?\s+([a-z]{3,9}\s+\d{1,2})\s+(?:mon|tue|wed|thu|fri|sat|sun),?\s+([a-z]{3,9}\s+\d{1,2})\b/i);
    if (!pair) continue;
    return parseExplicitDate(role === 'checkin' ? pair[1] : pair[2], receivedAt);
  }

  return null;
}

function parseExplicitDate(value: string, anchorDate = new Date()) {
  const cleaned = value.replace(/\bat\b.*$/i, '').replace(/\(.+?\)/g, '').trim();
  const iso = cleaned.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return iso;
  const dmy = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (dmy) return toDateKey(Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const named = cleaned.match(/\b(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})\b/i) ?? cleaned.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (named) {
    const monthName = Number.isNaN(Number(named[1])) ? named[1] : named[2];
    const day = Number.isNaN(Number(named[1])) ? Number(named[2]) : Number(named[1]);
    const year = Number(named[3]);
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex((m) =>
      monthName.toLowerCase().startsWith(m),
    ) + 1;
    if (month > 0) return toDateKey(year, month, day);
  }
  const namedWithoutYear = cleaned.match(/\b(?:mon|tue|wed|thu|fri|sat|sun),?\s+([A-Z][a-z]+)\s+(\d{1,2})\b/i) ?? cleaned.match(/\b([A-Z][a-z]+)\s+(\d{1,2})\b/i);
  if (namedWithoutYear) {
    const year = anchorDate.getFullYear();
    const monthName = namedWithoutYear[1];
    const day = Number(namedWithoutYear[2]);
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].findIndex((m) =>
      monthName.toLowerCase().startsWith(m),
    ) + 1;
    if (month > 0) return toDateKey(year, month, day);
  }
  return null;
}

function extractCount(text: string, labels: string[]) {
  for (const label of labels) {
    const before = text.match(new RegExp(`(\\d+)\\s*${label}`, 'i'))?.[1];
    if (before) return Number(before);
    const after = text.match(new RegExp(`${label}\\s*[:#-]?\\s*(\\d+)`, 'i'))?.[1];
    if (after) return Number(after);
  }
  return null;
}

function extractFinancial(text: string) {
  const symbolCurrency: Record<string, string> = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP' };
  const compact = compactText(text);
  const payoutHeadlineMatch =
    text.match(/([₹$€£])\s?(-?[\d,]+(?:\.\d{2})?)\s*(INR|USD|EUR|GBP)?\s+was sent/i) ??
    compact.match(/\b(-?[\d,]+(?:\.\d{2})?)\s*(INR|USD|EUR|GBP)\s+was sent/i);
  const totalPaidMatch =
    text.match(/\bTotal paid:\s*\n?\s*([₹$€£])\s?(-?[\d,]+(?:\.\d{2})?)\s*(INR|USD|EUR|GBP)?/i) ??
    compact.match(/\bTotal paid:\s*(-?[\d,]+(?:\.\d{2})?)\s*(INR|USD|EUR|GBP)\b/i);
  const sentDateMatch = compact.match(/money was sent on\s+([A-Z][a-z]+\s+\d{1,2})(?:,?\s*(\d{4}))?/i);
  const arrivalDateMatch = compact.match(/should arrive by\s+([A-Z][a-z]+\s+\d{1,2}),?\s*(\d{4})/i);
  const bankAccountMatch = compact.match(/\bBank account\s+(.+?)\s+(?:Payouts received|Airbnb account ID|Details)\b/i);
  const accountIdMatch = compact.match(/\bAirbnb account ID\s+(\d+)\b/i);
  const airbnbPayoutBeforeTax = extractAirbnbPayoutBeforeTax(text);
  const taxWithholdingMatch =
    compact.match(/(-?[₹$€£]\s?[\d,]+(?:\.\d{2})?)\s*(?:INR|USD|EUR|GBP)?\s+Tax Withholding/i) ??
    compact.match(/(-?[\d,]+(?:\.\d{2})?)\s*(?:INR|USD|EUR|GBP)\s+Tax Withholding/i);
  const totalMatch =
    text.match(/\bTOTAL\s*\((INR|USD|EUR|GBP)\)\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i) ??
    text.match(/\b(?:total amount|amount paid|guest paid|price|payout|payment)\s*[:#-]?\s*(INR|USD|EUR|GBP)?\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i);
  const roomFeeMatch = text.match(/(?:[₹$€£]\s?[\d,]+(?:\.\d{2})?)\s*x\s*\d+\s*nights?\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i);
  const guestServiceFeeMatch = text.match(/\bGuest service fee\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i);
  const occupancyTaxesMatch = text.match(/\bOccupancy taxes\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i);
  const hostServiceFeeMatch = text.match(/\bHost service fee(?:\s*\([^)]+\))?\s*(-?[₹$€£]?\s?[\d,]+(?:\.\d{2})?)/i);
  const hostPayoutMatch = text.match(/\bYOU EARN\s*([₹$€£])?\s?(-?[\d,]+(?:\.\d{2})?)/i);
  const anyMatch = totalPaidMatch ?? payoutHeadlineMatch ?? totalMatch ?? roomFeeMatch ?? guestServiceFeeMatch ?? occupancyTaxesMatch ?? hostServiceFeeMatch ?? hostPayoutMatch;

  if (!anyMatch) return undefined;
  const payoutCurrency = payoutMatchCurrency(totalPaidMatch) ?? payoutMatchCurrency(payoutHeadlineMatch);
  const currency = payoutCurrency ?? totalMatch?.[1]?.toUpperCase() ?? (anyMatch[1] ? symbolCurrency[anyMatch[1]] : null);
  const totalPaid = totalPaidMatch ? payoutMatchAmount(totalPaidMatch) : null;
  const payoutHeadline = payoutHeadlineMatch ? payoutMatchAmount(payoutHeadlineMatch) : null;
  return {
    currency,
    total: totalPaid ?? payoutHeadline ?? (totalMatch ? parseMoney(totalMatch[3]) : null),
    tax: occupancyTaxesMatch ? parseMoney(occupancyTaxesMatch[2]) : null,
    roomFee: roomFeeMatch ? parseMoney(roomFeeMatch[2]) : null,
    guestServiceFee: guestServiceFeeMatch ? parseMoney(guestServiceFeeMatch[2]) : null,
    occupancyTaxes: occupancyTaxesMatch ? parseMoney(occupancyTaxesMatch[2]) : null,
    hostServiceFee: hostServiceFeeMatch ? parseMoney(hostServiceFeeMatch[1]) : null,
    hostPayout: airbnbPayoutBeforeTax ?? (hostPayoutMatch ? parseMoney(hostPayoutMatch[2]) : null),
    payoutAmount: totalPaid ?? payoutHeadline,
    payoutSentDate: sentDateMatch ? normalizeMonthDay(sentDateMatch[1], sentDateMatch[2]) : null,
    payoutArrivalDate: arrivalDateMatch ? normalizeMonthDay(arrivalDateMatch[1], arrivalDateMatch[2]) : null,
    bankAccount: bankAccountMatch ? cleanLine(bankAccountMatch[1]) : null,
    airbnbAccountId: accountIdMatch?.[1] ?? null,
    taxWithholding: taxWithholdingMatch ? Math.abs(parseMoney(taxWithholdingMatch[1])) : null,
  };
}

function extractAirbnbPayoutBeforeTax(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const detailsIndex = lines.findIndex((line) => line.toLowerCase() === 'details');
  if (detailsIndex >= 0) {
    for (let index = detailsIndex + 1; index < Math.min(lines.length, detailsIndex + 6); index += 1) {
      const amount = lines[index].match(/^([₹$€£])\s?([\d,]+(?:\.\d{2})?)\s*(?:INR|USD|EUR|GBP)?$/i);
      if (amount) return parseMoney(amount[2]);
    }
  }
  const compactMatch = compactText(text).match(/\bDetails\s+.+?\s+[₹$€£]\s?([\d,]+(?:\.\d{2})?)\s*(?:INR|USD|EUR|GBP)?\s+Home\b/i);
  return compactMatch ? parseMoney(compactMatch[1]) : null;
}

function payoutMatchAmount(match: RegExpMatchArray) {
  return parseMoney(/[₹$€£]/.test(match[1]) ? match[2] : match[1]);
}

function payoutMatchCurrency(match: RegExpMatchArray | null) {
  if (!match) return null;
  if (match[3]) return match[3].toUpperCase();
  if (match[2] && /^[A-Z]{3}$/i.test(match[2])) return match[2].toUpperCase();
  return null;
}

function parseMoney(value: string) {
  return Number(value.replace(/[₹$€£,\s]/g, ''));
}

function normalizeMonthDay(monthDay: string, year?: string) {
  const parsed = parseExplicitDate(`${monthDay} ${year ?? new Date().getFullYear()}`);
  return parsed;
}

function extractLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*(?:[:#-]\\s*([^\\n]+)|\\n\\s*([^\\n]+))`, 'i'));
    if (match?.[1]) return cleanLine(match[1]);
    if (match?.[2]) return cleanLine(match[2]);
  }
  return null;
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[|,;]+$/, '');
}

function compactText(value: string) {
  return cleanLine(value.replace(/\u00a0/g, ' '));
}

function toDateKey(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
