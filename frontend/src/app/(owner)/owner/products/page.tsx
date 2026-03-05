'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { productsApi } from '@/lib/api/products';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Product {
  _id: string;
  name: string;
  price: number;
  salePrice?: number;
  images?: string[];
  category?: { name: string };
  isAvailable?: boolean;
}

export default function OwnerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await productsApi.getList();
      setProducts(res.data?.products ?? res.data ?? []);
    } catch {
      toast.error('상품 목록을 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await productsApi.delete(id);
      toast.success('상품이 삭제되었습니다');
      fetchProducts();
    } catch {
      toast.error('삭제에 실패했습니다');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">상품관리</h1>
        <Link href="/owner/products/new">
          <Button>
            <Plus className="size-4 mr-1" />
            새 상품
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div
              key={product._id}
              className="bg-white rounded-xl border overflow-hidden"
            >
              <div className="relative h-32 bg-muted">
                {product.images?.[0] ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl">💐</span>
                  </div>
                )}
                {product.isAvailable === false && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      품절
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{product.name}</p>
                    {product.category && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        {product.category.name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {product.salePrice ? (
                    <>
                      <span className="text-sm line-through text-muted-foreground">
                        {product.price.toLocaleString()}원
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {product.salePrice.toLocaleString()}원
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-bold">
                      {product.price.toLocaleString()}원
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/owner/products/${product._id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Pencil className="size-3.5 mr-1" />
                      수정
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(product._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <span className="text-4xl mb-4 block">💐</span>
          <p className="text-muted-foreground mb-4">등록된 상품이 없습니다</p>
          <Link href="/owner/products/new">
            <Button>첫 상품 등록하기</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
