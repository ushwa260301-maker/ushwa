import { Request, Response, NextFunction } from 'express';
import { User } from '../models/user.model';
import { Shop } from '../models/shop.model';
import { Order } from '../models/order.model';
import { Notification } from '../models/notification.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

export const getDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [totalUsers, totalShops, totalOrders, revenueResult] = await Promise.all([
      User.countDocuments(),
      Shop.countDocuments({ status: 'approved' }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: 'delivered' } },
        { $group: { _id: null, totalRevenue: { $sum: '$pricing.total' } } },
      ]),
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue || 0;

    // Get recent stats
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayOrders, monthlyOrders, pendingShops] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Shop.countDocuments({ status: 'pending' }),
    ]);

    const dashboard = {
      totalUsers,
      totalShops,
      totalOrders,
      totalRevenue,
      todayOrders,
      monthlyOrders,
      pendingShops,
    };

    successResponse(res, dashboard, '대시보드 데이터 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { role, search } = req.query;

    const filter: Record<string, unknown> = {};

    if (role) {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search as string, $options: 'i' } },
        { email: { $regex: search as string, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, users, pagination, '사용자 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    successResponse(res, user, '사용자 상세 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { isActive } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      throw ApiError.notFound('사용자를 찾을 수 없습니다.');
    }

    if (user.role === 'admin') {
      throw ApiError.badRequest('관리자 계정의 상태는 변경할 수 없습니다.');
    }

    user.isActive = isActive;
    await user.save();

    successResponse(res, user, isActive ? '계정이 활성화되었습니다.' : '계정이 비활성화되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const getShops = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, search } = req.query;

    const filter: Record<string, unknown> = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.name = { $regex: search as string, $options: 'i' };
    }

    const [shops, total] = await Promise.all([
      Shop.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name email')
        .lean(),
      Shop.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, shops, pagination, '매장 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const approveShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (shop.status !== 'pending') {
      throw ApiError.badRequest('대기 중인 매장만 승인할 수 있습니다.');
    }

    shop.status = 'approved';
    shop.rejectionReason = undefined;
    await shop.save();

    // Notify shop owner
    await Notification.create({
      recipient: shop.owner,
      type: 'shop',
      title: '매장 승인',
      body: `${shop.name} 매장이 승인되었습니다. 이제 영업을 시작할 수 있습니다.`,
      data: { shopId: shop._id, screen: 'ShopDashboard' },
    });

    successResponse(res, shop, '매장이 승인되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const rejectShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body;

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (shop.status !== 'pending') {
      throw ApiError.badRequest('대기 중인 매장만 거절할 수 있습니다.');
    }

    shop.status = 'rejected';
    shop.rejectionReason = reason || '심사 기준에 부합하지 않습니다.';
    await shop.save();

    // Notify shop owner
    await Notification.create({
      recipient: shop.owner,
      type: 'shop',
      title: '매장 승인 거절',
      body: `${shop.name} 매장 등록이 거절되었습니다. 사유: ${shop.rejectionReason}`,
      data: { shopId: shop._id, screen: 'ShopDashboard' },
    });

    successResponse(res, shop, '매장이 거절되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const suspendShop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body;

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (shop.status !== 'approved') {
      throw ApiError.badRequest('승인된 매장만 정지할 수 있습니다.');
    }

    shop.status = 'suspended';
    shop.isOpen = false;
    shop.rejectionReason = reason || '관리자에 의해 정지되었습니다.';
    await shop.save();

    // Notify shop owner
    await Notification.create({
      recipient: shop.owner,
      type: 'shop',
      title: '매장 정지',
      body: `${shop.name} 매장이 정지되었습니다. 사유: ${shop.rejectionReason}`,
      data: { shopId: shop._id, screen: 'ShopDashboard' },
    });

    successResponse(res, shop, '매장이 정지되었습니다.');
  } catch (error) {
    next(error);
  }
};
