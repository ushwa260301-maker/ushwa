export interface OperatingHour {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface DeliveryInfo {
  minOrderAmount: number;
  deliveryFee: number;
  deliveryRadius: number;
  estimatedDeliveryTime: string;
}

export interface Shop {
  _id: string;
  owner: string;
  name: string;
  description: string;
  phone: string;
  address: string;
  addressDetail: string;
  coordinates: {
    type: 'Point';
    coordinates: [number, number];
  };
  images: string[];
  profileImage: string;
  businessRegistrationNumber: string;
  operatingHours: {
    mon: OperatingHour;
    tue: OperatingHour;
    wed: OperatingHour;
    thu: OperatingHour;
    fri: OperatingHour;
    sat: OperatingHour;
    sun: OperatingHour;
  };
  deliveryInfo: DeliveryInfo;
  categories: string[];
  rating: {
    average: number;
    count: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  isOpen: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
