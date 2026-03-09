import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CartItem {
  productId: string;
  shopId: string;
  shopName: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  selectedOptions: Array<{ name: string; value: string; price: number }>;
  selectedAddOns: Array<{ name: string; price: number }>;
  messageCard?: string;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getDeliveryFee: () => number;
  getItemCount: () => number;
  getShopId: () => string | null;
  loadCart: () => Promise<void>;
}

const persistCart = async (items: CartItem[]) => {
  try {
    await AsyncStorage.setItem('eoseohwa-cart', JSON.stringify(items));
  } catch {
    // Silently fail if storage is unavailable
  }
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (item) => {
    const items = get().items;
    let newItems: CartItem[];
    if (items.length > 0 && items[0].shopId !== item.shopId) {
      newItems = [item];
    } else {
      const existing = items.find((i) => i.productId === item.productId);
      if (existing) {
        newItems = items.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      } else {
        newItems = [...items, item];
      }
    }
    set({ items: newItems });
    persistCart(newItems);
  },

  removeItem: (productId) => {
    const newItems = get().items.filter((i) => i.productId !== productId);
    set({ items: newItems });
    persistCart(newItems);
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    const newItems = get().items.map((i) =>
      i.productId === productId ? { ...i, quantity } : i
    );
    set({ items: newItems });
    persistCart(newItems);
  },

  clearCart: () => {
    set({ items: [] });
    persistCart([]);
  },

  getTotal: () => {
    return get().items.reduce((sum, item) => {
      const optionsPrice = item.selectedOptions.reduce((s, o) => s + o.price, 0);
      const addOnsPrice = item.selectedAddOns.reduce((s, a) => s + a.price, 0);
      return sum + (item.price + optionsPrice + addOnsPrice) * item.quantity;
    }, 0);
  },

  getDeliveryFee: () => 3000,

  getItemCount: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0);
  },

  getShopId: () => {
    const items = get().items;
    return items.length > 0 ? items[0].shopId : null;
  },

  loadCart: async () => {
    try {
      const stored = await AsyncStorage.getItem('eoseohwa-cart');
      if (stored) {
        set({ items: JSON.parse(stored) });
      }
    } catch {
      // Silently fail
    }
  },
}));
