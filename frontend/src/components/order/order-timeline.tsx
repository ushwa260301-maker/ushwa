'use client';

import { cn } from '@/lib/utils';

const statusLabels: Record<string, string> = {
  pending: '주문 대기',
  accepted: '주문 접수',
  preparing: '준비 중',
  ready: '준비 완료',
  delivering: '배달 중',
  delivered: '배달 완료',
  cancelled: '주문 취소',
  rejected: '주문 거절',
};

interface StatusEntry {
  status: string;
  timestamp: string;
  note?: string;
}

interface OrderTimelineProps {
  statusHistory: StatusEntry[];
  currentStatus: string;
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderTimeline({
  statusHistory,
  currentStatus,
}: OrderTimelineProps) {
  const history = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ status: currentStatus, timestamp: new Date().toISOString() }];

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const isLast = idx === history.length - 1;
        const isCurrent = entry.status === currentStatus;

        return (
          <div key={idx} className="flex gap-3">
            {/* Timeline line and dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'size-3 rounded-full shrink-0 mt-1.5',
                  isCurrent ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
              />
              {!isLast && (
                <div className="w-0.5 flex-1 bg-muted-foreground/20 my-1" />
              )}
            </div>

            {/* Content */}
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm',
                  isCurrent ? 'font-bold text-foreground' : 'text-muted-foreground'
                )}
              >
                {statusLabels[entry.status] ?? entry.status}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.timestamp)}
              </p>
              {entry.note && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {entry.note}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
