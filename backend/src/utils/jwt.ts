import jwt, { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { config } from '../config/env';
import { ApiError } from './api-error';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as string,
  } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw ApiError.unauthorized('Access token has expired');
    }
    if (error instanceof JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid access token');
    }
    throw ApiError.unauthorized('Token verification failed');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwtRefreshSecret) as TokenPayload;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token has expired');
    }
    if (error instanceof JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    throw ApiError.unauthorized('Token verification failed');
  }
};

export const generateTokenPair = (user: TokenPayload): TokenPair => {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};
