import mongoose, { Schema, Document } from 'mongoose';

export interface IProductOption {
  name: string;
  values: Array<{
    label: string;
    price: number;
  }>;
}

export interface IProductAddOn {
  name: string;
  price: number;
  image?: string;
  isAvailable: boolean;
}

export interface IProduct extends Document {
  shop: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  name: string;
  description: string;
  price: number;
  salePrice?: number;
  images: string[];
  thumbnail: string;
  options: IProductOption[];
  addOns: IProductAddOn[];
  flowers: string[];
  occasion: string[];
  tags: string[];
  rating: {
    average: number;
    count: number;
  };
  salesCount: number;
  isAvailable: boolean;
  isFeatured: boolean;
}

const optionValueSchema = new Schema(
  {
    label: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const optionSchema = new Schema(
  {
    name: { type: String, required: true },
    values: [optionValueSchema],
  },
  { _id: false },
);

const addOnSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    image: String,
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false },
);

const productRatingSchema = new Schema(
  {
    average: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const productSchema = new Schema<IProduct>(
  {
    shop: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    images: [{ type: String }],
    thumbnail: { type: String, default: '' },
    options: [optionSchema],
    addOns: [addOnSchema],
    flowers: [{ type: String }],
    occasion: [{ type: String }],
    tags: [{ type: String }],
    rating: { type: productRatingSchema, default: () => ({}) },
    salesCount: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true },
);

productSchema.index({ shop: 1, isAvailable: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'rating.average': -1 });
productSchema.index({ salesCount: -1 });
productSchema.index({ name: 'text', description: 'text' });

export const Product = mongoose.model<IProduct>('Product', productSchema);
