'use client';

import Image from 'next/image';

export interface Review {
  _id: string;
  customer: {
    _id: string;
    name: string;
    profileImage?: string;
  };
  product?: {
    _id: string;
    name: string;
    thumbnail?: string;
  };
  rating: number;
  content: string;
  images?: string[];
  ownerReply?: {
    content: string;
    createdAt: string;
  };
  createdAt: string;
}

interface ReviewCardProps {
  review: Review;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < rating ? 'text-yellow-400' : 'text-gray-200'}>
      ★
    </span>
  ));
}

export function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="py-4 border-b border-border last:border-b-0">
      {/* User info */}
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-full bg-muted overflow-hidden flex items-center justify-center">
          {review.customer?.profileImage ? (
            <Image
              src={review.customer?.profileImage ?? ''}
              alt={review.customer?.name ?? ''}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              {(review.customer?.name ?? '?').charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{review.customer?.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs flex">{renderStars(review.rating)}</span>
            <span className="text-xs text-muted-foreground">
              {formatDate(review.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Review content */}
      <p className="text-sm mt-2 leading-relaxed">{review.content}</p>

      {/* Review images */}
      {review.images && review.images.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {review.images.map((img, idx) => (
            <div
              key={idx}
              className="relative size-20 rounded-lg overflow-hidden shrink-0 bg-muted"
            >
              <Image
                src={img}
                alt={`리뷰 이미지 ${idx + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ))}
        </div>
      )}

      {/* Owner reply */}
      {review.ownerReply && (
        <div className="mt-3 ml-4 p-3 bg-muted/50 rounded-lg border-l-2 border-primary/30">
          <p className="text-xs font-medium text-primary mb-1">사장님 답글</p>
          <p className="text-sm text-muted-foreground">{review.ownerReply.content}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDate(review.ownerReply.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}
