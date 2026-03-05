'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { reviewsApi } from '@/lib/api/reviews';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

interface ShopReview {
  _id: string;
  user: { _id: string; name: string; profileImage?: string };
  rating: number;
  content: string;
  images?: string[];
  ownerReply?: { content: string; createdAt: string };
  createdAt: string;
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={i < rating ? 'text-yellow-400' : 'text-gray-200'}>
      ★
    </span>
  ));
}

export default function OwnerReviewsPage() {
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const fetchReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await reviewsApi.getShopReviews('my');
      setReviews(res.data?.reviews ?? res.data ?? []);
    } catch {
      toast.error('리뷰를 불러오지 못했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReply = async (reviewId: string) => {
    if (!replyContent.trim()) {
      toast.error('답글을 입력해주세요');
      return;
    }
    setIsReplying(true);
    try {
      await reviewsApi.reply(reviewId, replyContent);
      toast.success('답글이 등록되었습니다');
      setReplyingTo(null);
      setReplyContent('');
      fetchReviews();
    } catch {
      toast.error('답글 등록에 실패했습니다');
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">리뷰관리</h1>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review._id} className="bg-white rounded-xl border p-4 space-y-3">
              {/* Review Header */}
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                  {review.user.profileImage ? (
                    <Image
                      src={review.user.profileImage}
                      alt={review.user.name}
                      width={32}
                      height={32}
                      className="object-cover"
                    />
                  ) : (
                    <span className="text-xs">{review.user.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{review.user.name}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs flex">{renderStars(review.rating)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Content */}
              <p className="text-sm">{review.content}</p>

              {/* Images */}
              {review.images && review.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {review.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative size-16 rounded-lg overflow-hidden shrink-0 bg-muted"
                    >
                      <Image
                        src={img}
                        alt={`리뷰 ${idx + 1}`}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Owner Reply */}
              {review.ownerReply ? (
                <div className="ml-4 p-3 bg-muted/50 rounded-lg border-l-2 border-primary/30">
                  <p className="text-xs font-medium text-primary mb-1">내 답글</p>
                  <p className="text-sm text-muted-foreground">
                    {review.ownerReply.content}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(review.ownerReply.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              ) : replyingTo === review._id ? (
                <div className="ml-4 space-y-2">
                  <Textarea
                    placeholder="답글을 입력하세요"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReply(review._id)}
                      disabled={isReplying}
                    >
                      <Send className="size-3.5 mr-1" />
                      {isReplying ? '등록 중...' : '답글 등록'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReplyingTo(review._id)}
                >
                  <MessageSquare className="size-3.5 mr-1" />
                  답글 달기
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <MessageSquare className="size-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">아직 리뷰가 없습니다</p>
        </div>
      )}
    </div>
  );
}
