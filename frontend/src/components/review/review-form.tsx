'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { X, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { StarRating } from './star-rating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { reviewsApi } from '@/lib/api/reviews';

interface ReviewFormValues {
  rating: number;
  content: string;
}

interface ReviewFormProps {
  orderId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReviewForm({ orderId, onSuccess, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReviewFormValues>();

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, 5 - images.length);
    setImages((prev) => [...prev, ...newFiles]);

    newFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ReviewFormValues) => {
    if (rating === 0) {
      toast.error('별점을 선택해주세요');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('order', orderId);
      formData.append('rating', String(rating));
      formData.append('content', data.content);
      images.forEach((file) => {
        formData.append('images', file);
      });

      await reviewsApi.create(formData);
      toast.success('리뷰가 등록되었습니다');
      onSuccess?.();
    } catch {
      toast.error('리뷰 등록에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Star Rating */}
      <div className="space-y-2">
        <Label>별점</Label>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content">리뷰 내용</Label>
        <Textarea
          id="content"
          placeholder="최소 10자 이상 작성해주세요"
          rows={4}
          {...register('content', {
            required: '리뷰 내용을 입력해주세요',
            minLength: {
              value: 10,
              message: '최소 10자 이상 입력해주세요',
            },
          })}
        />
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content.message}</p>
        )}
      </div>

      {/* Photo Upload */}
      <div className="space-y-2">
        <Label>사진 첨부 (최대 5장)</Label>
        <div className="flex gap-2 flex-wrap">
          {previews.map((preview, idx) => (
            <div
              key={idx}
              className="relative size-20 rounded-lg overflow-hidden border"
            >
              <Image
                src={preview}
                alt={`Preview ${idx + 1}`}
                fill
                className="object-cover"
                sizes="80px"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <label className="size-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
              <ImagePlus className="size-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mt-1">추가</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageAdd}
                multiple
              />
            </label>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? '등록 중...' : '리뷰 등록'}
        </Button>
      </div>
    </form>
  );
}
