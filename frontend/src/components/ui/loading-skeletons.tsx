import { Skeleton } from '@/components/ui/skeleton';

// Shop card skeleton - matches ShopCard layout
export function ShopCardSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden">
      <Skeleton className="h-40 w-full" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

// Product card skeleton - matches ProductCard layout
export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    </div>
  );
}

// Order card skeleton - matches OrderCard layout
export function OrderCardSkeleton() {
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-16 w-16 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-4 w-1/4 ml-auto" />
    </div>
  );
}

// Home page hero skeleton
export function HeroSkeleton() {
  return (
    <Skeleton className="h-64 w-full rounded-xl" />
  );
}

// Category grid skeleton
export function CategorySkeleton() {
  return (
    <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

// Shop detail header skeleton
export function ShopDetailHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="aspect-[2.5/1] rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}

// Review card skeleton
export function ReviewCardSkeleton() {
  return (
    <div className="space-y-2 py-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-full" />
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24 mt-1" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
