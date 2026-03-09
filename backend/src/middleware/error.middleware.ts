import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';
import { config } from '../config/env';

interface MongooseValidationError extends Error {
  name: 'ValidationError';
  errors: Record<string, { message: string }>;
}

interface MongooseCastError extends Error {
  name: 'CastError';
  kind: string;
  path: string;
  value: unknown;
}

interface MongoDuplicateKeyError extends Error {
  code: number;
  keyValue: Record<string, unknown>;
}

const isMongooseValidationError = (error: Error): error is MongooseValidationError => {
  return error.name === 'ValidationError' && 'errors' in error;
};

const isMongooseCastError = (error: Error): error is MongooseCastError => {
  return error.name === 'CastError';
};

const isMongoDuplicateKeyError = (error: Error): error is MongoDuplicateKeyError => {
  return 'code' in error && (error as MongoDuplicateKeyError).code === 11000;
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: string[] = [];

  // Handle known ApiError instances
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  }
  // Handle Mongoose ValidationError
  else if (isMongooseValidationError(err)) {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).map((e) => e.message);
  }
  // Handle Mongoose CastError (e.g., invalid ObjectId)
  else if (isMongooseCastError(err)) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }
  // Handle MongoDB duplicate key error
  else if (isMongoDuplicateKeyError(err)) {
    statusCode = 409;
    const duplicateFields = Object.keys(err.keyValue).join(', ');
    message = `Duplicate value for: ${duplicateFields}`;
  }
  // Handle SyntaxError (malformed JSON body)
  else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }

  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('[Error]', {
      statusCode,
      message,
      errors,
      stack: err.stack,
    });
  } else {
    // In production, only log server errors
    if (statusCode >= 500) {
      console.error('[Error]', err.message, err.stack);
    }
  }

  // Build response
  const responseBody: Record<string, unknown> = {
    success: false,
    message,
  };

  if (errors.length > 0) {
    responseBody.errors = errors;
  }

  if (config.nodeEnv === 'development' && err.stack) {
    responseBody.stack = err.stack;
  }

  res.status(statusCode).json(responseBody);
};
