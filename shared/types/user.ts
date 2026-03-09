export type UserRole = 'customer' | 'owner' | 'admin';

export interface Address {
  _id?: string;
  label: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  isDefault: boolean;
}

export interface User {
  _id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  profileImage?: string;
  addresses: Address[];
  pushToken?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
