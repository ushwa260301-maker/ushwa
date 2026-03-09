import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  type: 'order' | 'review' | 'shop' | 'promotion' | 'system';
  title: string;
  body: string;
  data: {
    orderId?: mongoose.Types.ObjectId;
    shopId?: mongoose.Types.ObjectId;
    screen?: string;
  };
  isRead: boolean;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['order', 'review', 'shop', 'promotion', 'system'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: {
      orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
      shopId: { type: Schema.Types.ObjectId, ref: 'Shop' },
      screen: String,
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
