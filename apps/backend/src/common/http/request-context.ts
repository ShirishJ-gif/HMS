import type { Request } from 'express';

export const requestIdHeader = 'x-request-id';

export type RequestWithContext = Request & {
  requestId?: string;
  rawBody?: Buffer;
};
