import { Request, Response, NextFunction } from 'express';
import { Shop } from '../models/shop.model';
import { Order } from '../models/order.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

export const getShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { lat, lng, category, search, sort } = req.query;

    // If lat/lng provided, use geo query
    if (lat && lng) {
      const latitude = parseFloat(lat as string);
      const longitude = parseFloat(lng as string);
      const maxDistance = parseFloat((req.query.maxDistance as string) || '10000');

      const matchStage: Record<string, unknown> = {
        status: 'approved',
        isActive: true,
      };

      if (category) {
        const mongoose = await import('mongoose');
        matchStage.categories = new mongoose.Types.ObjectId(category as string);
      }

      if (search) {
        matchStage.name = { $regex: search as string, $options: 'i' };
      }

      const pipeline: any[] = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [longitude, latitude] },
            distanceField: 'distance',
            maxDistance,
            query: matchStage,
            spherical: true,
          },
        },
      ];

      // Count total for pagination
      const countPipeline = [...pipeline, { $count: 'total' }];
      const countResult = await Shop.aggregate(countPipeline);
      const total = countResult.length > 0 ? countResult[0].total : 0;

      // Sort
      if (sort === 'rating') {
        pipeline.push({ $sort: { 'rating.average': -1 } });
      } else {
        pipeline.push({ $sort: { distance: 1 } });
      }

      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });

      const shops = await Shop.aggregate(pipeline);
      const pagination = createPaginationResult(total, page, limit);

      paginatedResponse(res, shops, pagination, '매장 목록 조회 성공');
      return;
    }

    // Regular query without geo
    const filter: Record<string, unknown> = {
      status: 'approved',
      isActive: true,
    };

    if (category) {
      filter.categories = category;
    }

    if (search) {
      filter.name = { $regex: search as string, $options: 'i' };
    }

    let sortOption: Record<string, unknown> = { createdAt: -1 };
    if (sort === 'rating') {
      sortOption = { 'rating.average': -1 };
    } else if (sort === 'name') {
      sortOption = { name: 1 };
    }

    const [shops, total] = await Promise.all([
      Shop.find(filter)
        .sort(sortOption as Record<string, 1 | -1>)
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name')
        .lean(),
      Shop.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, shops, pagination, '매장 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getShopById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('categories', 'name slug icon');

    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    successResponse(res, shop, '매장 상세 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const createShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existingShop = await Shop.findOne({ owner: req.user!.id });
    if (existingShop) {
      throw ApiError.badRequest('이미 등록된 매장이 있습니다.');
    }

    const shopData = {
      ...req.body,
      owner: req.user!.id,
      status: 'pending',
    };

    const shop = await Shop.create(shopData);

    successResponse(res, shop, '매장이 등록되었습니다. 관리자 승인을 기다려주세요.', 201);
  } catch (error) {
    next(error);
  }
};

export const updateMyShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const allowedFields = [
      'name', 'description', 'phone', 'email', 'address', 'addressDetail',
      'zipCode', 'location', 'images', 'profileImage', 'categories',
      'operatingHours', 'deliveryInfo',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (shop as any)[field] = req.body[field];
      }
    }

    await shop.save();

    successResponse(res, shop, '매장 정보가 수정되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const toggleShopOpen = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (shop.status !== 'approved') {
      throw ApiError.badRequest('승인된 매장만 영업 상태를 변경할 수 있습니다.');
    }

    shop.isOpen = !shop.isOpen;
    await shop.save();

    successResponse(res, shop, shop.isOpen ? '매장이 영업을 시작했습니다.' : '매장이 영업을 종료했습니다.');
  } catch (error) {
    next(error);
  }
};

export const getMyShopAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalOrders, monthlyOrders, todayOrders, revenueResult] = await Promise.all([
      Order.countDocuments({ shop: shop._id }),
      Order.countDocuments({
        shop: shop._id,
        createdAt: { $gte: startOfMonth },
      }),
      Order.countDocuments({
        shop: shop._id,
        createdAt: { $gte: startOfToday },
      }),
      Order.aggregate([
        {
          $match: {
            shop: shop._id,
            status: 'delivered',
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.total' },
            monthlyRevenue: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', startOfMonth] }, '$pricing.total', 0],
              },
            },
            todayRevenue: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', startOfToday] }, '$pricing.total', 0],
              },
            },
          },
        },
      ]),
    ]);

    const revenue = revenueResult[0] || { totalRevenue: 0, monthlyRevenue: 0, todayRevenue: 0 };

    const analytics = {
      orders: {
        total: totalOrders,
        monthly: monthlyOrders,
        today: todayOrders,
      },
      revenue: {
        total: revenue.totalRevenue,
        monthly: revenue.monthlyRevenue,
        today: revenue.todayRevenue,
      },
      rating: shop.rating,
    };

    successResponse(res, analytics, '매장 분석 데이터 조회 성공');
  } catch (error) {
    next(error);
  }
};
