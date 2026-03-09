import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error';

/**
 * Authorization middleware factory.
 * Returns a middleware that checks if the authenticated user's role
 * is included in the list of allowed roles.
 *
 * Must be used after the `authenticate` middleware so that `req.user` is set.
 *
 * @param roles - Allowed role strings (e.g., 'admin', 'seller', 'customer')
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(
        ApiError.unauthorized('Authentication required before authorization.'),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied. Required role(s): ${roles.join(', ')}`,
        ),
      );
    }

    next();
  };
};
