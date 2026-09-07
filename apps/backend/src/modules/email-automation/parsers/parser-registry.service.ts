import { Injectable } from '@nestjs/common';
import { EmailSource, ParserType } from '@prisma/client';
import { SourceDetectorService } from '../classification/source-detector.service';
import { NormalizedProviderEmail, ParsedEmailEvent } from '../types';
import { GenericOtaParser, parseDirectGuestEnquiry } from './generic-ota.parser';
import { KnownEmailParser } from './parser.interface';

@Injectable()
export class ParserRegistryService {
  private readonly parsers: KnownEmailParser[] = [
    new GenericOtaParser(EmailSource.BOOKING_COM),
    new GenericOtaParser(EmailSource.AIRBNB),
    new GenericOtaParser(EmailSource.EXPEDIA),
    new GenericOtaParser(EmailSource.MAKEMYTRIP),
    new GenericOtaParser(EmailSource.GOIBIBO),
    new GenericOtaParser(EmailSource.AGODA),
  ];

  constructor(private readonly sourceDetector: SourceDetectorService) {}

  async parse(email: NormalizedProviderEmail): Promise<ParsedEmailEvent> {
    const matches = this.parsers
      .map((parser) => ({ parser, match: parser.canParse(email) }))
      .filter(({ match }) => match.matched)
      .sort((left, right) => right.match.confidence - left.match.confidence);

    if (matches[0]) {
      return matches[0].parser.parse(email);
    }

    const classification = this.sourceDetector.classify(email);
    if (classification.source === EmailSource.DIRECT_GUEST) {
      return parseDirectGuestEnquiry(email);
    }

    return {
      source: classification.source,
      category: classification.category,
      confidence: classification.confidence,
      parserType: ParserType.MANUAL,
      parserVersion: 'classification-only@1',
      evidence: { subject: email.subject },
    };
  }
}
