import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const items = get().items;
        if (items.length > 0 && items[0].shopId !== item.shopId) {
          set({ items: [item] });
          return;
        }
        const existing = items.find((i) => i.productId === item.productId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => set({ items: [] }),

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
    }),
    { name: 'eoseohwa-cart' }
  )
);
