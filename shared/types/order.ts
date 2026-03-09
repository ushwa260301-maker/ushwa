export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'delivering'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export type PaymentMethod = 'card' | 'kakao_pay' | 'naver_pay' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface OrderItem {
  product: string;
  productSnapshot: {
    name: string;
    image: string;
    basePrice: number;
  };
  selectedOption?: {
    name: string;
    priceModifier: number;
  };
  selectedAddOns: {
    name: string;
    price: number;
  }[];
  messageCard?: string;
  quantity: number;
  itemTotal: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  customer: string;
  shop: string;
  items: OrderItem[];
  pricing: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
  };
  delivery: {
    address: string;
    addressDetail: string;
    coordinates: { lat: number; lng: number };
    recipientName: string;
    recipientPhone: string;
    requestedDate?: string;
    requestedTimeSlot?: string;
    specialInstructions?: string;
  };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionId?: string;
    paidAt?: string;
  };
  status: OrderStatus;
  statusHistory: {
    status: string;
    timestamp: string;
    note?: string;
  }[];
  cancelReason?: string;
  rejectReason?: string;
  isReviewed: boolean;
  createdAt: string;
  updatedAt: string;
}
