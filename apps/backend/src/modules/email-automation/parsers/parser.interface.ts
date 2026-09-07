import { ParsedEmailEvent, ParserMatch, NormalizedProviderEmail } from '../types';

export interface KnownEmailParser {
  id: string;
  version: string;
  canParse(email: NormalizedProviderEmail): ParserMatch;
  parse(email: NormalizedProviderEmail): Promise<ParsedEmailEvent>;
}
