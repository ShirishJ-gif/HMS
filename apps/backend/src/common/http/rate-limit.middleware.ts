import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type RateLimitRule = {
  name: string;
  max: number;
  windowMs: number;
  match: (request: Request) => boolean;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const entries = new Map<string, RateLimitEntry>();
const cleanupEveryRequests = 500;
let requestCount = 0;

const authWindowMs = readPositiveInteger('AUTH_RATE_LIMIT_WINDOW_MS', 60_000);
const authMax = readPositiveInteger('AUTH_RATE_LIMIT_MAX', 10);
const webhookWindowMs = readPositiveInteger('WEBHOOK_RATE_LIMIT_WINDOW_MS', 60_000);
const webhookMax = readPositiveInteger('WEBHOOK_RATE_LIMIT_MAX', 120);
const providerActionWindowMs = readPositiveInteger('PROVIDER_ACTION_RATE_LIMIT_WINDOW_MS', 60_000);
const providerActionMax = readPositiveInteger('PROVIDER_ACTION_RATE_LIMIT_MAX', 40);

const providerActionSegments = new Set([
  'airbnb-host-activation',
  'airbnb-oauth2-tests',
  'airbnb-host-status',
  'airbnb-host-cancellation',
  'airbnb-host-info',
  'airbnb-listings',
  'automation',
  'availability-multiple',
  'disconnect',
  'pause',
  'property-activate',
  'property-check',
  'provider-account',
  'provider-availability',
  'provider-catalog',
  'provider-channels',
  'provider-currencies',
  'provider-price-models',
  'provider-reservations',
  'provider-reservations-queue',
  'provider-reservations-summary',
  'rates-multiple',
  'resume',
  'rooms-activate',
  'rooms-cancellation',
  'sync',
]);

const rules: RateLimitRule[] = [
  {
    name: 'auth',
    max: authMax,
    windowMs: authWindowMs,
    match: (request) => isAuthSensitivePath(request),
  },
  {
    name: 'webhook',
    max: webhookMax,
    windowMs: webhookWindowMs,
    match: (request) => normalizePath(request).startsWith('/webhooks/'),
  },
  {
    name: 'provider-action',
    max: providerActionMax,
    windowMs: providerActionWindowMs,
    match: (request) => isProviderActionPath(request),
  },
];

export function createRateLimitMiddleware() {
  return (request: Request, response: Response, next: NextFunction) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true' || request.method === 'OPTIONS') {
      next();
      return;
    }

    const rule = rules.find((candidate) => candidate.match(request));
    if (!rule) {
      next();
      return;
    }

    const now = Date.now();
    cleanupExpiredEntries(now);

    const key = `${rule.name}:${requestIdentity(request)}`;
    const current = entries.get(key);
    const entry = current && current.resetAt > now ? current : { count: 0, resetAt: now + rule.windowMs };
    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(rule.max - entry.count, 0);
    const retryAfterSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);

    response.setHeader('X-RateLimit-Limit', String(rule.max));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count <= rule.max) {
      next();
      return;
    }

    response.setHeader('Retry-After', String(retryAfterSeconds));
    response.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests. Try again later.',
      retry_after_seconds: retryAfterSeconds,
      rate_limit: {
        bucket: rule.name,
        limit: rule.max,
        window_seconds: Math.ceil(rule.windowMs / 1000),
      },
    });
  };
}

function isAuthSensitivePath(request: Request) {
  if (request.method !== 'POST') return false;
  return [
    '/auth/bootstrap',
    '/auth/login',
    '/auth/password-reset/request',
    '/auth/password-reset/confirm',
    '/auth/refresh',
  ].includes(normalizePath(request));
}

function isProviderActionPath(request: Request) {
  const path = normalizePath(request);
  if (request.method === 'GET' && path === '/channels') return false;
  if (path === '/channels') return request.method !== 'GET';
  if (request.method === 'POST' && path === '/channels/zodomus/setup') return true;
  if (!path.startsWith('/channels/')) return false;

  const [, base, , action] = path.split('/');
  if (base !== 'channels') return false;
  if (!action) return request.method !== 'GET';
  return providerActionSegments.has(action);
}

function normalizePath(request: Request) {
  return (request.path || request.originalUrl.split('?')[0] || '').replace(/\/+$/, '') || '/';
}

function requestIdentity(request: Request) {
  const authorization = request.get('authorization')?.trim();
  const tokenHash = authorization
    ? createHash('sha256').update(authorization).digest('hex').slice(0, 16)
    : 'anonymous';
  return `${clientIp(request)}:${tokenHash}`;
}

function clientIp(request: Request) {
  const forwardedFor = request.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();
  return firstForwardedIp || request.ip || request.socket.remoteAddress || 'unknown';
}

function cleanupExpiredEntries(now: number) {
  requestCount += 1;
  if (requestCount % cleanupEveryRequests !== 0 && entries.size < 10_000) return;

  for (const [key, entry] of entries.entries()) {
    if (entry.resetAt <= now) entries.delete(key);
  }
}

function readPositiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
