'use client';

import Image from 'next/image';
import { Minus, Plus, X } from 'lucide-react';
import { useCartStore } from '@/stores/cart.store';

interface CartItemProps {
  item: {
    productId: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
    selectedOptions: Array<{ name: string; value: string; price: number }>;
    selectedAddOns: Array<{ name: string; price: number }>;
    messageCard?: string;
  };
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const optionsPrice = item.selectedOptions.reduce((s, o) => s + o.price, 0);
  const addOnsPrice = item.selectedAddOns.reduce((s, a) => s + a.price, 0);
  const itemTotal = (item.price + optionsPrice + addOnsPrice) * item.quantity;

  return (
    <div className="flex gap-3 py-4 border-b border-border last:border-b-0">
      {/* Image */}
      <div className="relative size-20 rounded-lg overflow-hidden bg-muted shrink-0">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary/5">
            <span className="text-2xl">💐</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium truncate">{item.name}</h3>
          <button
            type="button"
            onClick={() => removeItem(item.productId)}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Selected Options */}
        {item.selectedOptions.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.selectedOptions
              .map(
                (o) =>
                  `${o.name}: ${o.value}${o.price > 0 ? ` (+${o.price.toLocaleString()}원)` : ''}`
              )
              .join(', ')}
          </p>
        )}

        {/* Selected Add-ons */}
        {item.selectedAddOns.length > 0 && (
          <p className="text-xs text-muted-foreground">
            추가: {item.selectedAddOns.map((a) => a.name).join(', ')}
          </p>
        )}

        {/* Message */}
        {item.messageCard && (
          <p className="text-xs text-muted-foreground truncate">
            메시지: {item.messageCard}
          </p>
        )}

        {/* Quantity Controls & Price */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
              className="size-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Minus className="size-3" />
            </button>
            <span className="text-sm font-medium w-5 text-center">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
              className="size-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Plus className="size-3" />
            </button>
          </div>
          <span className="text-sm font-bold">
            {itemTotal.toLocaleString()}원
          </span>
        </div>
      </div>
    </div>
  );
}
