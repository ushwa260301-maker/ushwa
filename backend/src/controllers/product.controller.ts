import { Request, Response, NextFunction } from 'express';
import { Product } from '../models/product.model';
import { Shop } from '../models/shop.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

export const getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, minPrice, maxPrice, sort } = req.query;

    const filter: Record<string, unknown> = { isAvailable: true };

    if (search) {
      filter.$or = [
        { name: { $regex: search as string, $options: 'i' } },
        { description: { $regex: search as string, $options: 'i' } },
      ];
    }

    if (category) {
      filter.category = category;
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) (filter.price as any).$gte = parseFloat(minPrice as string);
      if (maxPrice) (filter.price as any).$lte = parseFloat(maxPrice as string);
    }

    let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'rating') sortOption = { 'rating.average': -1 };
    else if (sort === 'popular') sortOption = { salesCount: -1 };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .populate('shop', 'name profileImage')
        .populate('category', 'name slug')
        .lean(),
      Product.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, products, pagination, '상품 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('shop', 'name profileImage phone address rating isOpen')
      .populate('category', 'name slug');

    if (!product) {
      throw ApiError.notFound('상품을 찾을 수 없습니다.');
    }

    successResponse(res, product, '상품 상세 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getProductsByShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const shopId = req.params.id;

    const filter: Record<string, unknown> = {
      shop: shopId,
      isAvailable: true,
    };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('category', 'name slug')
        .lean(),
      Product.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, products, pagination, '매장 상품 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getFeaturedProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { limit } = parsePagination(req.query);

    const products = await Product.find({ isAvailable: true, isFeatured: true })
      .sort({ 'rating.average': -1, salesCount: -1 })
      .limit(limit)
      .populate('shop', 'name profileImage')
      .populate('category', 'name slug')
      .lean();

    successResponse(res, products, '인기 상품 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (shop.status !== 'approved') {
      throw ApiError.badRequest('승인된 매장만 상품을 등록할 수 있습니다.');
    }

    const productData = {
      ...req.body,
      shop: shop._id,
    };

    const product = await Product.create(productData);

    successResponse(res, product, '상품이 등록되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const product = await Product.findOne({ _id: req.params.id, shop: shop._id });
    if (!product) {
      throw ApiError.notFound('상품을 찾을 수 없습니다.');
    }

    const allowedFields = [
      'name', 'description', 'price', 'salePrice', 'images', 'thumbnail',
      'options', 'addOns', 'flowers', 'occasion', 'tags', 'category',
      'isAvailable', 'isFeatured',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (product as any)[field] = req.body[field];
      }
    }

    await product.save();

    successResponse(res, product, '상품이 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const product = await Product.findOne({ _id: req.params.id, shop: shop._id });
    if (!product) {
      throw ApiError.notFound('상품을 찾을 수 없습니다.');
    }

    product.isAvailable = false;
    await product.save();

    successResponse(res, null, '상품이 삭제되었습니다.');
  } catch (error) {
    next(error);
  }
};
