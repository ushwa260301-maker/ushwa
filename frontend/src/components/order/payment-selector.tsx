'use client';

import { CreditCard, Smartphone, Building2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

type PaymentMethod = 'card' | 'kakaopay' | 'naverpay' | 'transfer';

interface PaymentSelectorProps {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

const paymentMethods: Array<{
  value: PaymentMethod;
  label: string;
  icon: React.ElementType;
}> = [
  { value: 'card', label: '신용/체크카드', icon: CreditCard },
  { value: 'kakaopay', label: '카카오페이', icon: Smartphone },
  { value: 'naverpay', label: '네이버페이', icon: Wallet },
  { value: 'transfer', label: '계좌이체', icon: Building2 },
];

export function PaymentSelector({ selected, onChange }: PaymentSelectorProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold">결제 수단</h2>
      <div className="grid grid-cols-2 gap-3">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          const isSelected = selected === method.value;
          return (
            <button
              key={method.value}
              type="button"
              onClick={() => onChange(method.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <Icon
                className={cn(
                  'size-6',
                  isSelected ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-sm',
                  isSelected ? 'font-medium text-primary' : 'text-muted-foreground'
                )}
              >
                {method.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { PaymentMethod };
