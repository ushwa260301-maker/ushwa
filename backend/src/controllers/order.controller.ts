import { Request, Response, NextFunction } from 'express';
import { Order, OrderStatus } from '../models/order.model';
import { Product } from '../models/product.model';
import { Shop } from '../models/shop.model';
import { Notification } from '../models/notification.model';
import { ApiError } from '../utils/api-error';
import { successResponse, paginatedResponse } from '../utils/api-response';
import { parsePagination, createPaginationResult } from '../utils/pagination';

export const createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { shopId, items, delivery, payment } = req.body;

    const shop = await Shop.findById(shopId);
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    if (!shop.isOpen || shop.status !== 'approved') {
      throw ApiError.badRequest('현재 주문을 받지 않는 매장입니다.');
    }

    // Build order items with product snapshots
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isAvailable) {
        throw ApiError.badRequest(`상품을 찾을 수 없거나 판매 중지된 상품입니다: ${item.productId}`);
      }

      let itemPrice = product.salePrice || product.price;

      // Add option prices
      const selectedOptions = (item.selectedOptions || []).map((opt: { name: string; value: string; price: number }) => {
        itemPrice += opt.price || 0;
        return { name: opt.name, value: opt.value, price: opt.price || 0 };
      });

      // Add add-on prices
      const selectedAddOns = (item.selectedAddOns || []).map((addon: { name: string; price: number }) => {
        itemPrice += addon.price || 0;
        return { name: addon.name, price: addon.price || 0 };
      });

      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        product: product._id,
        productSnapshot: {
          name: product.name,
          price: product.salePrice || product.price,
          thumbnail: product.thumbnail,
        },
        quantity: item.quantity,
        selectedOptions,
        selectedAddOns,
        subtotal: itemSubtotal,
      });
    }

    // Calculate pricing
    const deliveryFee = delivery?.type === 'pickup' ? 0 : shop.deliveryInfo.fee;
    const freeDeliveryOver = shop.deliveryInfo.freeDeliveryOver;
    const actualDeliveryFee = freeDeliveryOver > 0 && subtotal >= freeDeliveryOver ? 0 : deliveryFee;
    const discount = 0;
    const total = subtotal + actualDeliveryFee - discount;

    // Check minimum order
    if (shop.deliveryInfo.minOrderAmount && subtotal < shop.deliveryInfo.minOrderAmount) {
      throw ApiError.badRequest(`최소 주문 금액은 ${shop.deliveryInfo.minOrderAmount}원입니다.`);
    }

    const order = await Order.create({
      customer: req.user!.id,
      shop: shop._id,
      items: orderItems,
      pricing: {
        subtotal,
        deliveryFee: actualDeliveryFee,
        discount,
        total,
      },
      delivery: {
        type: delivery?.type || 'delivery',
        address: delivery?.address || '',
        addressDetail: delivery?.addressDetail || '',
        recipientName: delivery?.recipientName || '',
        recipientPhone: delivery?.recipientPhone || '',
        requestedDate: delivery?.requestedDate,
        requestedTime: delivery?.requestedTime || '',
        message: delivery?.message || '',
      },
      payment: {
        method: payment?.method || 'card',
        status: 'completed', // Mock payment
        paidAt: new Date(),
        transactionId: `TXN-${Date.now()}`,
      },
      status: 'pending',
    });

    // Create notification for shop owner
    await Notification.create({
      recipient: shop.owner,
      type: 'order',
      title: '새로운 주문',
      body: `새로운 주문이 접수되었습니다. (${order.orderNumber})`,
      data: { orderId: order._id, shopId: shop._id, screen: 'ShopOrderDetail' },
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('shop', 'name')
      .populate('customer', 'name');

    successResponse(res, populatedOrder, '주문이 완료되었습니다.', 201);
  } catch (error) {
    next(error);
  }
};

export const getMyOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status } = req.query;

    const filter: Record<string, unknown> = { customer: req.user!.id };
    if (status) {
      filter.status = status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('shop', 'name profileImage')
        .lean(),
      Order.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, orders, pagination, '주문 내역 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getShopOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status } = req.query;

    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const filter: Record<string, unknown> = { shop: shop._id };
    if (status) {
      filter.status = status;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name phone')
        .lean(),
      Order.countDocuments(filter),
    ]);

    const pagination = createPaginationResult(total, page, limit);
    paginatedResponse(res, orders, pagination, '매장 주문 목록 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('shop', 'name profileImage phone address')
      .populate('customer', 'name phone email');

    if (!order) {
      throw ApiError.notFound('주문을 찾을 수 없습니다.');
    }

    // Check if user is customer, shop owner, or admin
    const isCustomer = order.customer._id.toString() === req.user!.id;
    const shop = await Shop.findById(order.shop._id);
    const isOwner = shop?.owner.toString() === req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    if (!isCustomer && !isOwner && !isAdmin) {
      throw ApiError.forbidden('이 주문을 조회할 권한이 없습니다.');
    }

    successResponse(res, order, '주문 상세 조회 성공');
  } catch (error) {
    next(error);
  }
};

export const acceptOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const order = await Order.findOne({ _id: req.params.id, shop: shop._id });
    if (!order) {
      throw ApiError.notFound('주문을 찾을 수 없습니다.');
    }

    if (order.status !== 'pending') {
      throw ApiError.badRequest('대기 중인 주문만 수락할 수 있습니다.');
    }

    order.status = 'accepted';
    order.statusHistory.push({
      status: 'accepted',
      timestamp: new Date(),
      note: '주문이 수락되었습니다.',
    });
    await order.save();

    // Notify customer
    await Notification.create({
      recipient: order.customer,
      type: 'order',
      title: '주문 수락',
      body: `주문(${order.orderNumber})이 수락되었습니다.`,
      data: { orderId: order._id, shopId: shop._id, screen: 'OrderDetail' },
    });

    successResponse(res, order, '주문이 수락되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const rejectOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body;

    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const order = await Order.findOne({ _id: req.params.id, shop: shop._id });
    if (!order) {
      throw ApiError.notFound('주문을 찾을 수 없습니다.');
    }

    if (order.status !== 'pending') {
      throw ApiError.badRequest('대기 중인 주문만 거절할 수 있습니다.');
    }

    order.status = 'rejected';
    order.rejectionReason = reason || '매장 사정으로 인해 주문이 거절되었습니다.';
    order.statusHistory.push({
      status: 'rejected',
      timestamp: new Date(),
      note: order.rejectionReason,
    });

    // Mock refund
    order.payment.status = 'refunded';
    await order.save();

    // Notify customer
    await Notification.create({
      recipient: order.customer,
      type: 'order',
      title: '주문 거절',
      body: `주문(${order.orderNumber})이 거절되었습니다. 사유: ${order.rejectionReason}`,
      data: { orderId: order._id, shopId: shop._id, screen: 'OrderDetail' },
    });

    successResponse(res, order, '주문이 거절되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, note } = req.body;

    const shop = await Shop.findOne({ owner: req.user!.id });
    if (!shop) {
      throw ApiError.notFound('매장을 찾을 수 없습니다.');
    }

    const order = await Order.findOne({ _id: req.params.id, shop: shop._id });
    if (!order) {
      throw ApiError.notFound('주문을 찾을 수 없습니다.');
    }

    // Validate status flow
    const statusFlow: Record<string, OrderStatus[]> = {
      accepted: ['preparing'],
      preparing: ['ready'],
      ready: ['delivering'],
      delivering: ['delivered'],
    };

    const allowedNext = statusFlow[order.status];
    if (!allowedNext || !allowedNext.includes(status)) {
      throw ApiError.badRequest(`현재 상태(${order.status})에서 ${status}로 변경할 수 없습니다.`);
    }

    order.status = status;
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: note || '',
    });

    // Update product sales count when delivered
    if (status === 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { salesCount: item.quantity },
        });
      }
    }

    await order.save();

    // Notify customer
    const statusMessages: Record<string, string> = {
      preparing: '꽃다발을 준비하고 있습니다.',
      ready: '꽃다발이 준비되었습니다.',
      delivering: '배달이 시작되었습니다.',
      delivered: '배달이 완료되었습니다.',
    };

    await Notification.create({
      recipient: order.customer,
      type: 'order',
      title: '주문 상태 변경',
      body: `주문(${order.orderNumber}): ${statusMessages[status] || status}`,
      data: { orderId: order._id, shopId: shop._id, screen: 'OrderDetail' },
    });

    successResponse(res, order, '주문 상태가 변경되었습니다.');
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body;

    const order = await Order.findOne({ _id: req.params.id, customer: req.user!.id });
    if (!order) {
      throw ApiError.notFound('주문을 찾을 수 없습니다.');
    }

    if (order.status !== 'pending') {
      throw ApiError.badRequest('대기 중인 주문만 취소할 수 있습니다.');
    }

    order.status = 'cancelled';
    order.cancelReason = reason || '고객 요청으로 취소';
    order.statusHistory.push({
      status: 'cancelled',
      timestamp: new Date(),
      note: order.cancelReason,
    });

    // Mock refund
    order.payment.status = 'refunded';
    await order.save();

    // Notify shop owner
    const shop = await Shop.findById(order.shop);
    if (shop) {
      await Notification.create({
        recipient: shop.owner,
        type: 'order',
        title: '주문 취소',
        body: `주문(${order.orderNumber})이 고객에 의해 취소되었습니다.`,
        data: { orderId: order._id, shopId: shop._id, screen: 'ShopOrderDetail' },
      });
    }

    successResponse(res, order, '주문이 취소되었습니다.');
  } catch (error) {
    next(error);
  }
};
