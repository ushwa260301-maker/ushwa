'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddOn {
  name: string;
  price: number;
}

interface AddOnSelectorProps {
  addOns: AddOn[];
  selectedAddOns: AddOn[];
  onChange: (addOns: AddOn[]) => void;
}

export function AddOnSelector({ addOns, selectedAddOns, onChange }: AddOnSelectorProps) {
  if (!addOns || addOns.length === 0) return null;

  const toggleAddOn = (addOn: AddOn) => {
    const isSelected = selectedAddOns.some((a) => a.name === addOn.name);
    if (isSelected) {
      onChange(selectedAddOns.filter((a) => a.name !== addOn.name));
    } else {
      onChange([...selectedAddOns, addOn]);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">추가 상품</p>
      <div className="space-y-2">
        {addOns.map((addOn) => {
          const isSelected = selectedAddOns.some((a) => a.name === addOn.name);
          return (
            <button
              key={addOn.name}
              type="button"
              onClick={() => toggleAddOn(addOn)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'size-5 rounded flex items-center justify-center border transition-colors',
                    isSelected
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30'
                  )}
                >
                  {isSelected && <Check className="size-3.5 text-white" />}
                </div>
                <span>{addOn.name}</span>
              </div>
              <span className="text-muted-foreground">
                +{addOn.price.toLocaleString()}원
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
