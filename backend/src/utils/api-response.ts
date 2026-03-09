import { Response } from 'express';

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface SuccessResponseBody {
  success: true;
  message: string;
  data: unknown;
}

interface ErrorResponseBody {
  success: false;
  message: string;
  errors?: string[];
}

interface PaginatedResponseBody {
  success: true;
  message: string;
  data: unknown;
  pagination: PaginationInfo;
}

export const successResponse = (
  res: Response,
  data: unknown = null,
  message = 'Success',
  statusCode = 200,
): Response<SuccessResponseBody> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (
  res: Response,
  message = 'Error',
  statusCode = 500,
  errors: string[] = [],
): Response<ErrorResponseBody> => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors.length > 0 && { errors }),
  });
};

export const paginatedResponse = (
  res: Response,
  data: unknown = [],
  pagination: PaginationInfo,
  message = 'Success',
  statusCode = 200,
): Response<PaginatedResponseBody> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination,
  });
};
