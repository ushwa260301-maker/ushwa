import mongoose, { Schema, Document } from 'mongoose';

export interface IOperatingHours {
  day: string;
  open: string;
  close: string;
  isOpen: boolean;
}

export interface IDeliveryInfo {
  isAvailable: boolean;
  fee: number;
  freeDeliveryOver: number;
  minOrderAmount: number;
  estimatedTime: string;
  maxDistance: number;
}

export interface IRating {
  average: number;
  count: number;
}

export interface IShop extends Document {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  phone: string;
  email: string;
  businessNumber: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  images: string[];
  profileImage: string;
  categories: mongoose.Types.ObjectId[];
  operatingHours: IOperatingHours[];
  deliveryInfo: IDeliveryInfo;
  rating: IRating;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  rejectionReason?: string;
  isOpen: boolean;
  isActive: boolean;
}

const operatingHoursSchema = new Schema(
  {
    day: { type: String, required: true },
    open: { type: String, default: '09:00' },
    close: { type: String, default: '18:00' },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false },
);

const deliveryInfoSchema = new Schema(
  {
    isAvailable: { type: Boolean, default: true },
    fee: { type: Number, default: 0 },
    freeDeliveryOver: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0 },
    estimatedTime: { type: String, default: '60분' },
    maxDistance: { type: Number, default: 10 },
  },
  { _id: false },
);

const ratingSchema = new Schema(
  {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const shopSchema = new Schema<IShop>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    businessNumber: { type: String, default: '' },
    address: { type: String, required: true },
    addressDetail: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    images: [{ type: String }],
    profileImage: { type: String, default: '' },
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    operatingHours: [operatingHoursSchema],
    deliveryInfo: { type: deliveryInfoSchema, default: () => ({}) },
    rating: { type: ratingSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },
    rejectionReason: String,
    isOpen: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

shopSchema.index({ location: '2dsphere' });
shopSchema.index({ owner: 1 });
shopSchema.index({ status: 1 });
shopSchema.index({ isActive: 1, isOpen: 1 });
shopSchema.index({ 'rating.average': -1 });

export const Shop = mongoose.model<IShop>('Shop', shopSchema);
