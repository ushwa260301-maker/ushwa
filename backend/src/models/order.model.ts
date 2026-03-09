import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'delivering'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  productSnapshot: {
    name: string;
    price: number;
    thumbnail: string;
  };
  quantity: number;
  selectedOptions: Array<{
    name: string;
    value: string;
    price: number;
  }>;
  selectedAddOns: Array<{
    name: string;
    price: number;
  }>;
  subtotal: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customer: mongoose.Types.ObjectId;
  shop: mongoose.Types.ObjectId;
  items: IOrderItem[];
  pricing: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
  };
  delivery: {
    type: 'delivery' | 'pickup';
    address: string;
    addressDetail: string;
    recipientName: string;
    recipientPhone: string;
    requestedDate: Date;
    requestedTime: string;
    message: string;
  };
  payment: {
    method: 'card' | 'transfer' | 'cash';
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    paidAt?: Date;
    transactionId?: string;
  };
  status: OrderStatus;
  statusHistory: Array<{
    status: OrderStatus;
    timestamp: Date;
    note?: string;
  }>;
  rejectionReason?: string;
  cancelReason?: string;
}

const selectedOptionSchema = new Schema(
  {
    name: { type: String, required: true },
    value: { type: String, required: true },
    price: { type: Number, default: 0 },
  },
  { _id: false },
);

const selectedAddOnSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, default: 0 },
  },
  { _id: false },
);

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: { type: String, required: true },
      price: { type: Number, required: true },
      thumbnail: { type: String, default: '' },
    },
    quantity: { type: Number, required: true, min: 1 },
    selectedOptions: [selectedOptionSchema],
    selectedAddOns: [selectedAddOnSchema],
    subtotal: { type: Number, required: true },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

const deliverySchema = new Schema(
  {
    type: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
    address: { type: String, default: '' },
    addressDetail: { type: String, default: '' },
    recipientName: { type: String, default: '' },
    recipientPhone: { type: String, default: '' },
    requestedDate: { type: Date },
    requestedTime: { type: String, default: '' },
    message: { type: String, default: '' },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    method: { type: String, enum: ['card', 'transfer', 'cash'], default: 'card' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    paidAt: Date,
    transactionId: String,
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled', 'rejected'],
      required: true,
    },
    timestamp: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false },
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shop: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    items: [orderItemSchema],
    pricing: { type: pricingSchema, required: true },
    delivery: { type: deliverySchema, default: () => ({}) },
    payment: { type: paymentSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled', 'rejected'],
      default: 'pending',
    },
    statusHistory: [statusHistorySchema],
    rejectionReason: String,
    cancelReason: String,
  },
  { timestamps: true },
);

// Auto-generate orderNumber in format EOH-YYYYMMDD-XXX
orderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    const prefix = `EOH-${dateStr}-`;

    // Find the last order of today to determine the next sequential number
    const lastOrder = await mongoose
      .model('Order')
      .findOne({ orderNumber: { $regex: `^${prefix}` } })
      .sort({ orderNumber: -1 })
      .lean();

    let seq = 1;
    if (lastOrder && (lastOrder as unknown as { orderNumber: string }).orderNumber) {
      const lastSeq = parseInt((lastOrder as unknown as { orderNumber: string }).orderNumber.split('-')[2], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    this.orderNumber = `${prefix}${String(seq).padStart(3, '0')}`;

    // Add initial status to history
    if (this.statusHistory.length === 0) {
      this.statusHistory.push({
        status: this.status,
        timestamp: now,
      });
    }
  }
  next();
});

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ shop: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 });

export const Order = mongoose.model<IOrder>('Order', orderSchema);
