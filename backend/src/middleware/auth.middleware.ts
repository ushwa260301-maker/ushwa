import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { ApiError } from '../utils/api-error';

// Augment the Express Request interface to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

const extractBearerToken = (authHeader: string | undefined): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
};

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw ApiError.unauthorized('Authentication required. No token provided.');
    }

    // verifyAccessToken throws ApiError on failure (expired, invalid, etc.)
    const decoded = verifyAccessToken(token);

    // Attach the decoded payload to the request object
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
