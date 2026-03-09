import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt';
import { ApiError } from '../utils/api-error';
import { successResponse } from '../utils/api-response';

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, name, phone, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw ApiError.badRequest('이미 등록된 이메일입니다.');
    }

    const user = await User.create({
      email,
      password,
      name,
      phone,
      role: role || 'customer',
    });

    const tokens = generateTokenPair({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    successResponse(res, { user, ...tokens }, '회원가입이 완료되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw ApiError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('비활성화된 계정입니다. 관리자에게 문의하세요.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = generateTokenPair({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    successResponse(res, { user, ...tokens }, '로그인 성공');
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      throw ApiError.badRequest('리프레시 토큰이 필요합니다.');
    }

    const decoded = verifyRefreshToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      throw ApiError.unauthorized('사용자를 찾을 수 없습니다.');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('비활성화된 계정입니다.');
    }

    const tokens = generateTokenPair({
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    successResponse(res, tokens, '토큰이 갱신되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    successResponse(res, user, '사용자 정보 조회 성공');
  } catch (error) {
    next(error);
  }
};
