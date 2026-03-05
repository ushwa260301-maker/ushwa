'use client';

import { cn } from '@/lib/utils';

interface OptionGroup {
  name: string;
  values: Array<{ label: string; price: number }>;
}

interface OptionSelectorProps {
  options: OptionGroup[];
  selectedOptions: Record<string, { label: string; price: number }>;
  onChange: (optionName: string, value: { label: string; price: number }) => void;
}

export function OptionSelector({ options, selectedOptions, onChange }: OptionSelectorProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className="space-y-4">
      {options.map((group) => (
        <div key={group.name}>
          <p className="text-sm font-medium mb-2">{group.name}</p>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const isSelected =
                selectedOptions[group.name]?.label === value.label;

              return (
                <button
                  key={value.label}
                  type="button"
                  onClick={() => onChange(group.name, value)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm border transition-colors',
                    isSelected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-foreground border-border hover:border-primary/50'
                  )}
                >
                  {value.label}
                  {value.price > 0 && (
                    <span className="ml-1 text-xs opacity-80">
                      (+{value.price.toLocaleString()}원)
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
