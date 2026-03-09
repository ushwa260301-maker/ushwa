interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
}

interface PaginationResult {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const parsePagination = (query: PaginationQuery): ParsedPagination => {
  let page = Number(query.page);
  let limit = Number(query.limit);

  if (isNaN(page) || page < 1) {
    page = DEFAULT_PAGE;
  }

  if (isNaN(limit) || limit < 1) {
    limit = DEFAULT_LIMIT;
  }

  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  page = Math.floor(page);
  limit = Math.floor(limit);

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const createPaginationResult = (
  total: number,
  page: number,
  limit: number,
): PaginationResult => {
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};
