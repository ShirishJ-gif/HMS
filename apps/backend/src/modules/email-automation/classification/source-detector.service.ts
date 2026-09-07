import { Injectable } from '@nestjs/common';
import { EmailCategory, EmailSource } from '@prisma/client';
import { NormalizedProviderEmail } from '../types';

export type EmailClassification = {
  source: EmailSource;
  category: EmailCategory;
  confidence: number;
};

@Injectable()
export class SourceDetectorService {
  classify(email: Pick<NormalizedProviderEmail, 'from' | 'subject' | 'plainText' | 'headers'>): EmailClassification {
    const haystack = `${email.from.email} ${email.subject} ${email.plainText ?? ''}`.toLowerCase();
    const source = this.detectSource(haystack);
    const category = this.detectCategory(haystack, source);
    const confidence = this.confidenceFor(source, category, haystack);
    return { source, category, confidence };
  }

  private detectSource(text: string) {
    if (text.includes('booking.com') || text.includes('booking-com')) return EmailSource.BOOKING_COM;
    if (text.includes('airbnb')) return EmailSource.AIRBNB;
    if (text.includes('expedia') || text.includes('hotels.com')) return EmailSource.EXPEDIA;
    if (text.includes('makemytrip') || text.includes('make my trip') || text.includes('mmt')) return EmailSource.MAKEMYTRIP;
    if (text.includes('goibibo')) return EmailSource.GOIBIBO;
    if (text.includes('agoda')) return EmailSource.AGODA;
    if (/(room|stay|availability|book|reservation|check-?in)/i.test(text)) return EmailSource.DIRECT_GUEST;
    return EmailSource.UNKNOWN;
  }

  private detectCategory(text: string, source: EmailSource) {
    if (/(newsletter|unsubscribe|promo|promotion|offer|deal|discount)/i.test(text)) return EmailCategory.PROMOTION;
    if (/(cancelled|canceled|cancellation confirmed|booking cancelled)/i.test(text)) return EmailCategory.BOOKING_CANCELLATION;
    if (/(modified|updated|changed|amended)/i.test(text)) return EmailCategory.BOOKING_MODIFICATION;
    if (/(payment received|payout|paid|invoice)/i.test(text)) return EmailCategory.PAYMENT_NOTIFICATION;
    if (/(new reservation|reservation confirmed|booking confirmed|confirmation number|booking id|reservation id)/i.test(text)) {
      return EmailCategory.BOOKING_CONFIRMATION;
    }
    if (source === EmailSource.DIRECT_GUEST && /(available|availability|book|reserve|room|tariff|rate)/i.test(text)) {
      return EmailCategory.BOOKING_ENQUIRY;
    }
    if (source !== EmailSource.UNKNOWN && source !== EmailSource.DIRECT_GUEST) return EmailCategory.OTA_MESSAGE;
    return EmailCategory.UNKNOWN;
  }

  private confidenceFor(source: EmailSource, category: EmailCategory, text: string) {
    if (category === EmailCategory.PROMOTION) return 0.95;
    if (source !== EmailSource.UNKNOWN && category === EmailCategory.BOOKING_CONFIRMATION && /(reservation|booking|confirmation)\s*(number|id|code|no)/i.test(text)) {
      return 0.96;
    }
    if (source !== EmailSource.UNKNOWN && category !== EmailCategory.UNKNOWN) return 0.9;
    if (category === EmailCategory.BOOKING_ENQUIRY) return 0.86;
    return 0.45;
  }
}
