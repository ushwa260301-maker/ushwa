export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: string[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    errors: string[] = [],
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors: string[] = []): ApiError {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized', errors: string[] = []): ApiError {
    return new ApiError(401, message, errors);
  }

  static forbidden(message = 'Forbidden', errors: string[] = []): ApiError {
    return new ApiError(403, message, errors);
  }

  static notFound(message = 'Not Found', errors: string[] = []): ApiError {
    return new ApiError(404, message, errors);
  }

  static internal(message = 'Internal Server Error', errors: string[] = []): ApiError {
    return new ApiError(500, message, errors, false);
  }
}
