export const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  DELIVERING: 'delivering',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
} as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '주문 대기',
  accepted: '주문 접수',
  preparing: '준비 중',
  ready: '준비 완료',
  delivering: '배달 중',
  delivered: '배달 완료',
  cancelled: '주문 취소',
  rejected: '주문 거절',
};

export const ORDER_STATUS_FLOW: Record<string, string[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['delivering'],
  delivering: ['delivered'],
  delivered: [],
  cancelled: [],
  rejected: [],
};
