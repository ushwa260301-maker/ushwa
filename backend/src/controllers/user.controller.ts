import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { ApiError } from '../utils/api-error';
import { successResponse } from '../utils/api-response';

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    successResponse(res, user, '프로필 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    const allowedFields = ['name', 'phone', 'profileImage'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (user as any)[field] = req.body[field];
      }
    }

    await user.save();

    successResponse(res, user, '프로필이 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    const { label, address, addressDetail, zipCode, coordinates, isDefault } = req.body;

    // If this is set as default, unset existing default
    if (isDefault) {
      for (const addr of user.addresses) {
        addr.isDefault = false;
      }
    }

    user.addresses.push({
      label,
      address,
      addressDetail: addressDetail || '',
      zipCode: zipCode || '',
      coordinates: coordinates || { lat: 0, lng: 0 },
      isDefault: isDefault || user.addresses.length === 0,
    });

    await user.save();

    successResponse(res, user.addresses, '주소가 추가되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id?.toString() === req.params.id,
    );

    if (addressIndex === -1) {
      throw ApiError.notFound('주소를 찾을 수 없습니다.');
    }

    const allowedFields = ['label', 'address', 'addressDetail', 'zipCode', 'coordinates', 'isDefault'];

    // If setting as default, unset existing default
    if (req.body.isDefault) {
      for (const addr of user.addresses) {
        addr.isDefault = false;
      }
    }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (user.addresses[addressIndex] as any)[field] = req.body[field];
      }
    }

    await user.save();

    successResponse(res, user.addresses, '주소가 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id?.toString() === req.params.id,
    );

    if (addressIndex === -1) {
      throw ApiError.notFound('주소를 찾을 수 없습니다.');
    }

    const wasDefault = user.addresses[addressIndex].isDefault;
    user.addresses.splice(addressIndex, 1);

    // If deleted address was default and there are remaining addresses, set the first one as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    successResponse(res, user.addresses, '주소가 삭제되었습니다.');
  } catch (error) {
    next(error);
  }
};
