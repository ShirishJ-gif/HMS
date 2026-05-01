export type PaginatedResponse<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
};

export function paginationParams(query: { page?: number; limit?: number }) {
  const page = Math.max(query.page ?? 1, 1);
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      total_pages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}
