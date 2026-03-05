'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Star, Minus, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useProductDetail } from '@/hooks/useProducts';
import { useCartStore } from '@/stores/cart.store';
import { ImageGallery } from '@/components/product/image-gallery';
import { OptionSelector } from '@/components/product/option-selector';
import { AddOnSelector } from '@/components/product/addon-selector';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ shopId: string; id: string }>;
}) {
  const { shopId, id } = use(params);
  const { data, isLoading } = useProductDetail(id);
  const addItem = useCartStore((s) => s.addItem);

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, { label: string; price: number }>
  >({});
  const [selectedAddOns, setSelectedAddOns] = useState<
    Array<{ name: string; price: number }>
  >([]);
  const [messageCard, setMessageCard] = useState('');

  const product = data?.data;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="aspect-square rounded-2xl" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-4">😢</span>
        <p className="text-lg font-medium">상품을 찾을 수 없습니다</p>
        <Link
          href={`/shops/${shopId}`}
          className="text-primary text-sm mt-2 hover:underline"
        >
          꽃집으로 돌아가기
        </Link>
      </div>
    );
  }

  const hasDiscount = product.salePrice && product.salePrice < product.price;
  const basePrice = hasDiscount ? product.salePrice! : product.price;
  const discountPercent = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  const optionsPrice = Object.values(selectedOptions).reduce(
    (sum, opt) => sum + opt.price,
    0
  );
  const addOnsPrice = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
  const totalPrice = (basePrice + optionsPrice + addOnsPrice) * quantity;

  const shopName =
    typeof product.shop === 'object' ? product.shop.name : '';
  const shopIdFromProduct =
    typeof product.shop === 'object' ? product.shop._id : shopId;

  const handleOptionChange = (
    optionName: string,
    value: { label: string; price: number }
  ) => {
    setSelectedOptions((prev) => ({ ...prev, [optionName]: value }));
  };

  const handleAddToCart = () => {
    addItem({
      productId: product._id,
      shopId: shopIdFromProduct,
      shopName,
      name: product.name,
      image: product.images?.[0] ?? '',
      price: basePrice,
      quantity,
      selectedOptions: Object.entries(selectedOptions).map(
        ([name, val]) => ({
          name,
          value: val.label,
          price: val.price,
        })
      ),
      selectedAddOns,
      messageCard: messageCard || undefined,
    });
    toast.success('장바구니에 담았습니다');
  };

  return (
    <div className="max-w-4xl mx-auto pb-28">
      {/* Back button */}
      <div className="px-4 py-3">
        <Link
          href={`/shops/${shopId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          꽃집으로 돌아가기
        </Link>
      </div>

      <div className="px-4 space-y-6">
        {/* Image Gallery */}
        <ImageGallery images={product.images ?? []} alt={product.name} />

        {/* Product Info */}
        <div>
          <p className="text-sm text-muted-foreground">{shopName}</p>
          <h1 className="text-xl font-bold mt-1">{product.name}</h1>

          {/* Rating */}
          {product.rating > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <Star className="size-4 text-yellow-400 fill-yellow-400" />
              <span className="text-sm font-medium">
                {product.rating.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">
                ({product.reviewCount}개 리뷰)
              </span>
            </div>
          )}

          {/* Price */}
          <div className="flex items-center gap-2 mt-3">
            {hasDiscount && (
              <span className="text-lg font-bold text-primary">
                {discountPercent}%
              </span>
            )}
            <span className="text-xl font-bold">
              {basePrice.toLocaleString()}원
            </span>
            {hasDiscount && (
              <span className="text-sm text-muted-foreground line-through">
                {product.price.toLocaleString()}원
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* Description */}
        {product.description && (
          <>
            <div>
              <h2 className="text-sm font-semibold mb-2">상품 설명</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
            <Separator />
          </>
        )}

        {/* Options */}
        {product.options && product.options.length > 0 && (
          <>
            <OptionSelector
              options={product.options}
              selectedOptions={selectedOptions}
              onChange={handleOptionChange}
            />
            <Separator />
          </>
        )}

        {/* Add-ons */}
        {product.addOns && product.addOns.length > 0 && (
          <>
            <AddOnSelector
              addOns={product.addOns}
              selectedAddOns={selectedAddOns}
              onChange={setSelectedAddOns}
            />
            <Separator />
          </>
        )}

        {/* Message Card */}
        <div>
          <p className="text-sm font-medium mb-2">메시지 카드 (선택)</p>
          <Textarea
            placeholder="꽃과 함께 전달할 메시지를 작성해주세요"
            value={messageCard}
            onChange={(e) => setMessageCard(e.target.value)}
            rows={3}
            maxLength={200}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {messageCard.length}/200
          </p>
        </div>

        {/* Quantity */}
        <div>
          <p className="text-sm font-medium mb-2">수량</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="size-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Minus className="size-4" />
            </button>
            <span className="text-lg font-medium w-8 text-center">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="size-10 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t shadow-lg px-4 py-3 md:max-w-4xl md:mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">총 금액</p>
            <p className="text-xl font-bold text-primary">
              {totalPrice.toLocaleString()}원
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleAddToCart}
            disabled={!product.isAvailable}
            className="flex-1 max-w-[200px] gap-2"
          >
            <ShoppingCart className="size-4" />
            {product.isAvailable ? '장바구니 담기' : '품절'}
          </Button>
        </div>
      </div>
    </div>
  );
}
