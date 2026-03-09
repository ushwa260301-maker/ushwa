import { Request, Response, NextFunction } from 'express';
import { Notification } from '../models/notification.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

export const getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = { recipient: req.user!.id };

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, notifications, pagination, '알림 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user!.id,
    });

    if (!notification) {
      throw ApiError.notFound('알림을 찾을 수 없습니다.');
    }

    notification.isRead = true;
    await notification.save();

    successResponse(res, notification, '알림이 읽음 처리되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Notification.updateMany(
      { recipient: req.user!.id, isRead: false },
      { isRead: true },
    );

    successResponse(res, null, '모든 알림이 읽음 처리되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user!.id,
      isRead: false,
    });

    successResponse(res, { count }, '읽지 않은 알림 수 조회 성공');
  } catch (error) {
    next(error);
  }
};
