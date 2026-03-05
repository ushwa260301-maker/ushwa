'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { productsApi } from '@/lib/api/products';
import { categoriesApi } from '@/lib/api/categories';
import { ProductForm } from '@/components/product/product-form';

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Array<{ _id: string; name: string }>>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await categoriesApi.getAll();
        setCategories(res.data ?? []);
      } catch {
        // ignore
      }
    };
    fetchCategories();
  }, []);

  const handleSubmit = async (formData: FormData) => {
    await productsApi.create(formData);
    toast.success('상품이 등록되었습니다');
    router.push('/owner/products');
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/owner/products"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold">새 상품 등록</h1>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <ProductForm
          categories={categories}
          onSubmit={handleSubmit}
          submitLabel="등록"
        />
      </div>
    </div>
  );
}
