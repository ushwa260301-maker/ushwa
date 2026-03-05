'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}

const sizeMap = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

export function StarRating({
  value,
  onChange,
  size = 'md',
  readonly = false,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);

  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= displayValue;

        return (
          <button
            key={i}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(starValue)}
            onMouseEnter={() => !readonly && setHoverValue(starValue)}
            onMouseLeave={() => !readonly && setHoverValue(0)}
            className={cn(
              'transition-colors',
              readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110',
            )}
          >
            <Star
              className={cn(
                sizeMap[size],
                isFilled
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'fill-none text-gray-300',
                'transition-colors',
              )}
            />
          </button>
        );
      })}
      {value > 0 && (
        <span className="text-sm text-muted-foreground ml-1">{value}점</span>
      )}
    </div>
  );
}
