export interface Review {
  _id: string;
  order: string;
  customer: string;
  shop: string;
  product: string;
  rating: number;
  content: string;
  images: string[];
  ownerReply?: {
    content: string;
    createdAt: string;
  };
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}
