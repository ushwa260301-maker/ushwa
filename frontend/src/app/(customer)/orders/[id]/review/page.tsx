'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ReviewForm } from '@/components/review/review-form';

export default function WriteReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href={`/orders/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-xl font-bold">리뷰 작성</h1>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <ReviewForm
          orderId={id}
          onSuccess={() => router.push(`/orders/${id}`)}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
