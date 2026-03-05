'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { productsApi } from '@/lib/api/products';
import { categoriesApi } from '@/lib/api/categories';
import { ProductForm } from '@/components/product/product-form';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productRes, categoriesRes] = await Promise.all([
          productsApi.getById(id),
          categoriesApi.getAll(),
        ]);
        setProduct(productRes.data ?? null);
        setCategories(categoriesRes.data ?? []);
      } catch {
        toast.error('상품을 불러오지 못했습니다');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleSubmit = async (formData: FormData) => {
    await productsApi.update(id, formData);
    toast.success('상품이 수정되었습니다');
    router.push('/owner/products');
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">상품을 찾을 수 없습니다</p>
        <Link href="/owner/products" className="text-primary text-sm hover:underline">
          돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/owner/products"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold">상품 수정</h1>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <ProductForm
          initialData={product as {
            name?: string;
            description?: string;
            price?: number;
            salePrice?: number;
            category?: string;
            images?: string[];
            flowers?: string[];
            occasions?: string[];
            options?: Array<{ name: string; values: string[]; priceModifier?: number }>;
            addOns?: Array<{ name: string; price: number }>;
          }}
          categories={categories}
          onSubmit={handleSubmit}
          submitLabel="수정"
        />
      </div>
    </div>
  );
}
