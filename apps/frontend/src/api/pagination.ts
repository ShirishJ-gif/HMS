import { AxiosRequestConfig } from 'axios';
import { api } from './client';

export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
};

export function unwrapList<T>(response: T[] | PaginatedResponse<T>) {
  return Array.isArray(response) ? response : response.data;
}

const defaultPageLimit = 100;

export async function fetchAllPages<T>(path: string, config?: AxiosRequestConfig) {
  const items: T[] = [];
  const baseParams =
    config?.params && typeof config.params === 'object'
      ? (config.params as Record<string, unknown>)
      : {};
  const limit =
    typeof baseParams.limit === 'number' && Number.isFinite(baseParams.limit)
      ? baseParams.limit
      : defaultPageLimit;

  let page = 1;
  let totalPages = 1;

  do {
    const response = await api.get<PaginatedResponse<T>>(path, {
      ...config,
      params: {
        ...baseParams,
        limit,
        page,
      },
    });

    items.push(...unwrapList(response.data));
    totalPages = response.data.meta?.total_pages ?? page;

    if ((response.data.data ?? []).length === 0) {
      break;
    }

    page += 1;
  } while (page <= totalPages);

  return items;
}
