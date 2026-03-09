import { Request, Response, NextFunction } from 'express';
import { Review } from '../models/review.model';
import { Order } from '../models/order.model';
import { Shop } from '../models/shop.model';
import { Product } from '../models/product.model';
import { Notification } from '../models/notification.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

const updateShopRating = async (shopId: string): Promise<void> => {
  const result = await Review.aggregate([
    { $match: { shop: (await import('mongoose')).Types.ObjectId.createFromHexString(shopId), isActive: true } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const rating = result[0] || { average: 0, count: 0 };
  await Shop.findByIdAndUpdate(shopId, {
    rating: {
      average: Math.round(rating.average * 10) / 10,
      count: rating.count,
    },
  });
};

const updateProductRating = async (productId: string): Promise<void> => {
  const result = await Review.aggregate([
    { $match: { product: (await import('mongoose')).Types.ObjectId.createFromHexString(productId), isActive: true } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const rating = result[0] || { average: 0, count: 0 };
  await Product.findByIdAndUpdate(productId, {
    rating: {
      average: Math.round(rating.average * 10) / 10,
      count: rating.count,
    },
  });
};

export const createReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orderId, productId, rating, content, images } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      customer: req.user!.id,
      status: 'delivered',
    });

    if (!order) {
      throw ApiError.badRequest('배달 완료된 주문에만 리뷰를 작성할 수 있습니다.');
    }

    const existingReview = await Review.findOne({ order: orderId });
    if (existingReview) {
      throw ApiError.badRequest('이미 리뷰를 작성한 주문입니다.');
    }

    const review = await Review.create({
      order: orderId,
      customer: req.user!.id,
      shop: order.shop,
      product: productId,
      rating,
      content: content || '',
      images: images || [],
    });

    // Update shop and product ratings
    await updateShopRating(order.shop.toString());
    await updateProductRating(productId);

    // Notify shop owner
    const shop = await Shop.findById(order.shop);
    if (shop) {
      await Notification.create({
        recipient: shop.owner,
        type: 'review',
        title: '새로운 리뷰',
        body: `새로운 리뷰가 작성되었습니다. (${rating}점)`,
        data: { orderId: order._id, shopId: shop._id, screen: 'ShopReviews' },
      });
    }

    successResponse(res, review, '리뷰가 작성되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const getShopReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const shopId = req.params.shopId;

    const filter = { shop: shopId, isActive: true };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name profileImage')
        .populate('product', 'name thumbnail')
        .lean(),
      Review.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, reviews, pagination, '매장 리뷰 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getMyReviews = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { customer: req.user!.id, isActive: true };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('shop', 'name profileImage')
        .populate('product', 'name thumbnail')
        .lean(),
      Review.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, reviews, pagination, '내 리뷰 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const replyToReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { content } = req.body;

    if (!content) {
      throw ApiError.badRequest('답변 내용을 입력해주세요.');
    }

    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const review = await Review.findOne({ _id: req.params.id, shop: shop._id });
    if (!review) {
      throw ApiError.notFound('리뷰를 찾을 수 없습니다.');
    }

    if (review.ownerReply) {
      throw ApiError.badRequest('이미 답변이 등록된 리뷰입니다.');
    }

    review.ownerReply = {
      content,
      createdAt: new Date(),
    };
    await review.save();

    // Notify customer
    await Notification.create({
      recipient: review.customer,
      type: 'review',
      title: '리뷰 답변',
      body: `${shop.name}에서 리뷰에 답변했습니다.`,
      data: { shopId: shop._id, screen: 'ReviewDetail' },
    });

    successResponse(res, review, '리뷰 답변이 등록되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const deleteReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const review = await Review.findOne({ _id: req.params.id, customer: req.user!.id });
    if (!review) {
      throw ApiError.notFound('리뷰를 찾을 수 없습니다.');
    }

    review.isActive = false;
    await review.save();

    // Update ratings
    await updateShopRating(review.shop.toString());
    await updateProductRating(review.product.toString());

    successResponse(res, null, '리뷰가 삭제되었습니다.');
  } catch (error) {
    next(error);
  }
};
