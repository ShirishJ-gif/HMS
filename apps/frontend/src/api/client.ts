import axios, { AxiosError } from 'axios';

const requestIdHeader = 'x-request-id';

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
  const token = localStorage.getItem('hms_access_token');
  const requestId = createRequestId();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.headers[requestIdHeader] = requestId;

  return config;
});

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
