import mongoose, { Schema, Document } from 'mongoose';
import { hashPassword, comparePassword } from '../utils/password';

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'customer' | 'owner' | 'admin';
  profileImage?: string;
  addresses: Array<{
    _id?: mongoose.Types.ObjectId;
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    coordinates: { lat: number; lng: number };
    isDefault: boolean;
  }>;
  pushToken?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const addressSchema = new Schema({
  label: { type: String, required: true },
  address: { type: String, required: true },
  addressDetail: { type: String, default: '' },
  zipCode: { type: String, default: '' },
  coordinates: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
  },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    role: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },
    profileImage: String,
    addresses: [addressSchema],
    pushToken: String,
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return comparePassword(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export const User = mongoose.model<IUser>('User', userSchema);
