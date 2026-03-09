import { Request, Response, NextFunction } from 'express';
import { Category } from '../models/category.model';
import { ApiError } from '../utils/api-error';
import { successResponse } from '../utils/api-response';

export const getCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean();

    successResponse(res, categories, '카테고리 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, slug, icon, image, description, sortOrder } = req.body;

    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
      throw ApiError.badRequest('이미 존재하는 슬러그입니다.');
    }

    const category = await Category.create({
      name,
      slug,
      icon: icon || '',
      image: image || '',
      description: description || '',
      sortOrder: sortOrder || 0,
    });

    successResponse(res, category, '카테고리가 생성되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      throw ApiError.notFound('카테고리를 찾을 수 없습니다.');
    }

    const allowedFields = ['name', 'slug', 'icon', 'image', 'description', 'sortOrder', 'isActive'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (category as any)[field] = req.body[field];
      }
    }

    // Check for slug uniqueness if slug is being changed
    if (req.body.slug && req.body.slug !== category.slug) {
      const existingCategory = await Category.findOne({ slug: req.body.slug });
      if (existingCategory) {
        throw ApiError.badRequest('이미 존재하는 슬러그입니다.');
      }
    }

    await category.save();

    successResponse(res, category, '카테고리가 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      throw ApiError.notFound('카테고리를 찾을 수 없습니다.');
    }

    category.isActive = false;
    await category.save();

    successResponse(res, null, '카테고리가 삭제되었습니다.');
  } catch (error) {
    next(error);
  }
};
