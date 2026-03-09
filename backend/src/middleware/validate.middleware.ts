import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';

/**
 * A schema-like interface for validation.
 * Compatible with Zod schemas or any object that exposes a `parse` method.
 * The `parse` method should throw an error with a `message` property
 * (and optionally an `errors` array) if validation fails.
 */
interface ValidationSchema {
  parse(data: unknown): unknown;
}

/**
 * Validation error shape thrown by schema.parse().
 * Supports both Zod-style errors and simple Error objects.
 */
interface ValidationErrorLike {
  message: string;
  errors?: Array<{ message: string; path?: (string | number)[] }>;
}

const isValidationErrorLike = (err: unknown): err is ValidationErrorLike => {
  return err instanceof Error || (typeof err === 'object' && err !== null && 'message' in err);
};

/**
 * Validation target specifies which part of the request to validate.
 */
type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Generic validation middleware factory.
 *
 * Accepts a schema object with a `parse` method and an optional validation target.
 * Defaults to validating `req.body`.
 *
 * @param schema - Object with a `parse(data)` method that throws on invalid data.
 * @param target - Which part of the request to validate ('body' | 'query' | 'params').
 * @returns Express middleware function.
 *
 * @example
 * // With a Zod schema
 * router.post('/flowers', validate(createFlowerSchema), createFlower);
 *
 * // Validate query parameters
 * router.get('/flowers', validate(listFlowersQuerySchema, 'query'), listFlowers);
 */
export const validate = (schema: ValidationSchema, target: ValidationTarget = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[target];
      const parsed = schema.parse(data);

      // Replace the target with the parsed (and potentially transformed) data
      (req as any)[target] = parsed;

      next();
    } catch (err: unknown) {
      if (isValidationErrorLike(err)) {
        const errorMessages: string[] = [];

        if (err.errors && Array.isArray(err.errors)) {
          // Zod-style error with array of issues
          for (const issue of err.errors) {
            const path = issue.path ? issue.path.join('.') : '';
            const prefix = path ? `${path}: ` : '';
            errorMessages.push(`${prefix}${issue.message}`);
          }
        } else {
          errorMessages.push(err.message);
        }

        return next(ApiError.badRequest('Validation failed', errorMessages));
      }

      return next(ApiError.badRequest('Validation failed'));
    }
  };
};
