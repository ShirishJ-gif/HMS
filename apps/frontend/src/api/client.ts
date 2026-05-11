import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { AuthResponse } from './types';
import { clearStoredSession, getStoredAccessToken, getStoredRefreshToken, storeAuthSession } from './session';

const requestIdHeader = 'x-request-id';
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  const requestId = createRequestId();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers[requestIdHeader] = requestId;

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as RetryableRequestConfig | undefined;
    if (
      error.response?.status !== 401 ||
      !originalConfig ||
      originalConfig._retry ||
      isAuthRequest(originalConfig.url)
    ) {
      return Promise.reject(error);
    }

    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearStoredSession();
      return Promise.reject(error);
    }

    originalConfig._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const nextAccessToken = await refreshPromise;
      if (!nextAccessToken) {
        clearStoredSession();
        return Promise.reject(error);
      }

      originalConfig.headers.Authorization = `Bearer ${nextAccessToken}`;
      return api.request(originalConfig);
    } catch (refreshError) {
      clearStoredSession();
      return Promise.reject(refreshError);
    }
  },
);

export function getApiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = resolveAxiosErrorMessage(error);
    const requestId = error.response?.headers?.[requestIdHeader] as string | undefined;

    if (requestId && responseMessage && !responseMessage.includes(requestId)) {
      return `${responseMessage} (request ${requestId})`;
    }

    return responseMessage;
  }

  return error instanceof Error ? error.message : 'Request failed';
}

function resolveAxiosErrorMessage(error: AxiosError) {
  const data = error.response?.data;

  if (typeof data === 'string' && data.trim().length > 0) {
    return data;
  }

  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  return error.message || 'Request failed';
}

function isAuthRequest(url?: string) {
  if (!url) {
    return false;
  }

  return (
    url.includes('/auth/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/bootstrap') ||
    url.includes('/auth/password-reset/')
  );
}

async function refreshAccessToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const response = await axios.post<AuthResponse>(
    '/auth/refresh',
    { refresh_token: refreshToken },
    {
      baseURL: api.defaults.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );

  storeAuthSession(response.data);
  return response.data.access_token;
}
