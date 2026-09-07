import { Injectable } from '@nestjs/common';
import { AutomationDecision, EmailCategory, EmailSource, ParserType } from '@prisma/client';
import { AutomationDecisionResult, ParsedEmailEvent, ReservationResolution } from '../types';

@Injectable()
export class EmailAutomationPolicyService {
  decide(event: ParsedEmailEvent, resolution: ReservationResolution): AutomationDecisionResult {
    const ignoredCategories: EmailCategory[] = [EmailCategory.PROMOTION, EmailCategory.OFFER, EmailCategory.GENERAL];
    if (ignoredCategories.includes(event.category)) {
      return { decision: AutomationDecision.IGNORE, reasonCodes: ['IRRELEVANT_CATEGORY'], automationConfidence: event.confidence };
    }

    if (event.category === EmailCategory.BOOKING_ENQUIRY && event.source === EmailSource.DIRECT_GUEST) {
      return {
        decision: event.confidence >= 0.75 ? AutomationDecision.CREATE_ENQUIRY : AutomationDecision.REVIEW,
        reasonCodes: event.confidence >= 0.75 ? ['DIRECT_GUEST_ENQUIRY'] : ['LOW_CONFIDENCE'],
        automationConfidence: event.confidence,
      };
    }

    if (resolution.type === 'EXISTING') {
      if (event.category === EmailCategory.BOOKING_CANCELLATION && event.confidence >= 0.94) {
        return { decision: AutomationDecision.CANCEL_RESERVATION, reasonCodes: ['EXTERNAL_ID_MATCHED', 'TRUSTED_CANCELLATION'], automationConfidence: event.confidence };
      }
      return { decision: AutomationDecision.ATTACH_TO_RESERVATION, reasonCodes: ['EXTERNAL_ID_MATCHED'], automationConfidence: event.confidence };
    }

    if (event.category === EmailCategory.BOOKING_CONFIRMATION) {
      const parserTrusted = event.parserType === ParserType.DETERMINISTIC;
      const hasCoreFields = Boolean(event.externalReservationId && event.stay?.checkIn && event.stay?.checkOut);
      if (parserTrusted && hasCoreFields && event.confidence >= 0.98) {
        return { decision: AutomationDecision.REVIEW, reasonCodes: ['READY_FOR_RESERVATION_CONFIRMATION'], automationConfidence: event.confidence };
      }
    }

    if (resolution.type === 'AMBIGUOUS') {
      return { decision: AutomationDecision.REVIEW, reasonCodes: ['AMBIGUOUS_RESERVATION_MATCH'], automationConfidence: event.confidence };
    }

    return { decision: AutomationDecision.REVIEW, reasonCodes: ['UNSAFE_TO_AUTOMATE'], automationConfidence: event.confidence };
  }
}
