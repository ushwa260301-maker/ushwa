export interface ProductOption {
  _id?: string;
  name: string;
  priceModifier: number;
}

export interface ProductAddOn {
  _id?: string;
  name: string;
  price: number;
  image?: string;
}

export interface Product {
  _id: string;
  shop: string;
  name: string;
  description: string;
  basePrice: number;
  discountPrice?: number;
  images: string[];
  category: string;
  options: ProductOption[];
  addOns: ProductAddOn[];
  hasMessageCard: boolean;
  flowers: string[];
  occasion: string[];
  isAvailable: boolean;
  isFeatured: boolean;
  salesCount: number;
  rating: {
    average: number;
    count: number;
  };
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
