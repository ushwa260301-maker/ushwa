import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
  order: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  shop: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  rating: number;
  content: string;
  images: string[];
  ownerReply?: {
    content: string;
    createdAt: Date;
  };
  isActive: boolean;
}

const ownerReplySchema = new Schema(
  {
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const reviewSchema = new Schema<IReview>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shop: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, default: '' },
    images: [{ type: String }],
    ownerReply: ownerReplySchema,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

reviewSchema.index({ shop: 1, createdAt: -1 });
reviewSchema.index({ customer: 1 });
reviewSchema.index({ product: 1 });
reviewSchema.index({ order: 1 });

export const Review = mongoose.model<IReview>('Review', reviewSchema);
