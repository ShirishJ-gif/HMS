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
