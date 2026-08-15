// Pagination is a cross-cutting concern for every list endpoint. A single util
// keeps the semantics identical everywhere: 1-based pages, a hard cap on page
// size so a hostile client cannot request an unbounded document set, and a
// standard `meta` envelope the controllers attach to responses.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PageOptions {
  page: number;
  limit: number;
  skip: number;
}

export function toPageOptions(input: PaginationInput): PageOptions {
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE)));
  return { page, limit, skip: (page - 1) * limit };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export function buildPaginationMeta(total: number, options: PageOptions): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / options.limit));
  return {
    page: options.page,
    limit: options.limit,
    total,
    totalPages,
    hasNextPage: options.page < totalPages,
    hasPreviousPage: options.page > 1,
  };
}
