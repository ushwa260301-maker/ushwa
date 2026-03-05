'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

interface ProductOption {
  name: string;
  values: string;
  priceModifier: string;
}

interface ProductAddOn {
  name: string;
  price: string;
}

interface ProductFormValues {
  name: string;
  description: string;
  price: string;
  salePrice: string;
  category: string;
  flowers: string;
  occasions: string;
  options: ProductOption[];
  addOns: ProductAddOn[];
}

interface ProductFormProps {
  initialData?: {
    name?: string;
    description?: string;
    price?: number;
    salePrice?: number;
    category?: string;
    images?: string[];
    flowers?: string[];
    occasions?: string[];
    options?: Array<{ name: string; values: string[]; priceModifier?: number }>;
    addOns?: Array<{ name: string; price: number }>;
  };
  categories?: Array<{ _id: string; name: string }>;
  onSubmit: (formData: FormData) => Promise<void>;
  submitLabel?: string;
}

export function ProductForm({
  initialData,
  categories = [],
  onSubmit,
  submitLabel = '저장',
}: ProductFormProps) {
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>(initialData?.images ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProductFormValues>({
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      price: initialData?.price?.toString() ?? '',
      salePrice: initialData?.salePrice?.toString() ?? '',
      category: initialData?.category ?? '',
      flowers: initialData?.flowers?.join(', ') ?? '',
      occasions: initialData?.occasions?.join(', ') ?? '',
      options: initialData?.options?.map((o) => ({
        name: o.name,
        values: o.values.join(', '),
        priceModifier: o.priceModifier?.toString() ?? '0',
      })) ?? [],
      addOns: initialData?.addOns?.map((a) => ({
        name: a.name,
        price: a.price.toString(),
      })) ?? [],
    },
  });

  const {
    fields: optionFields,
    append: appendOption,
    remove: removeOption,
  } = useFieldArray({ control, name: 'options' });

  const {
    fields: addOnFields,
    append: appendAddOn,
    remove: removeAddOn,
  } = useFieldArray({ control, name: 'addOns' });

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 10 - images.length);
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

  const handleFormSubmit = async (data: ProductFormValues) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description);
      formData.append('price', data.price);
      if (data.salePrice) formData.append('salePrice', data.salePrice);
      if (data.category) formData.append('category', data.category);

      if (data.flowers) {
        const flowers = data.flowers.split(',').map((f) => f.trim()).filter(Boolean);
        formData.append('flowers', JSON.stringify(flowers));
      }
      if (data.occasions) {
        const occasions = data.occasions.split(',').map((o) => o.trim()).filter(Boolean);
        formData.append('occasions', JSON.stringify(occasions));
      }

      if (data.options.length > 0) {
        const options = data.options.map((o) => ({
          name: o.name,
          values: o.values.split(',').map((v) => v.trim()),
          priceModifier: Number(o.priceModifier) || 0,
        }));
        formData.append('options', JSON.stringify(options));
      }

      if (data.addOns.length > 0) {
        const addOns = data.addOns.map((a) => ({
          name: a.name,
          price: Number(a.price) || 0,
        }));
        formData.append('addOns', JSON.stringify(addOns));
      }

      images.forEach((file) => {
        formData.append('images', file);
      });

      await onSubmit(formData);
    } catch {
      toast.error('저장에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Images */}
      <div className="space-y-2">
        <Label>상품 이미지</Label>
        <div className="flex gap-2 flex-wrap">
          {previews.map((preview, idx) => (
            <div key={idx} className="relative size-24 rounded-lg overflow-hidden border">
              <Image
                src={preview}
                alt={`Preview ${idx + 1}`}
                fill
                className="object-cover"
                sizes="96px"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <label className="size-24 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
            <ImagePlus className="size-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mt-1">추가</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageAdd}
              multiple
            />
          </label>
        </div>
      </div>

      {/* Basic Info */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">상품명 *</Label>
          <Input
            id="name"
            {...register('name', { required: '상품명을 입력해주세요' })}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">설명</Label>
          <Textarea id="description" rows={3} {...register('description')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price">가격 *</Label>
            <Input
              id="price"
              type="number"
              {...register('price', { required: '가격을 입력해주세요' })}
            />
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="salePrice">할인가</Label>
            <Input id="salePrice" type="number" {...register('salePrice')} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">카테고리</Label>
          <select
            id="category"
            {...register('category')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">선택하세요</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flowers">꽃 종류 (쉼표로 구분)</Label>
          <Input id="flowers" placeholder="장미, 튤립, 카네이션" {...register('flowers')} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="occasions">용도/행사 태그 (쉼표로 구분)</Label>
          <Input
            id="occasions"
            placeholder="생일, 기념일, 축하"
            {...register('occasions')}
          />
        </div>
      </div>

      <Separator />

      {/* Options */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>옵션</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendOption({ name: '', values: '', priceModifier: '0' })}
          >
            <Plus className="size-4 mr-1" />
            옵션 추가
          </Button>
        </div>
        {optionFields.map((field, idx) => (
          <div key={field.id} className="flex gap-2 items-start">
            <Input
              placeholder="옵션명"
              {...register(`options.${idx}.name`)}
              className="flex-1"
            />
            <Input
              placeholder="값 (쉼표 구분)"
              {...register(`options.${idx}.values`)}
              className="flex-[2]"
            />
            <Input
              placeholder="추가금"
              type="number"
              {...register(`options.${idx}.priceModifier`)}
              className="w-24"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeOption(idx)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      {/* AddOns */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>추가 상품</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendAddOn({ name: '', price: '' })}
          >
            <Plus className="size-4 mr-1" />
            추가
          </Button>
        </div>
        {addOnFields.map((field, idx) => (
          <div key={field.id} className="flex gap-2 items-start">
            <Input
              placeholder="이름"
              {...register(`addOns.${idx}.name`)}
              className="flex-1"
            />
            <Input
              placeholder="가격"
              type="number"
              {...register(`addOns.${idx}.price`)}
              className="w-32"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAddOn(idx)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? '저장 중...' : submitLabel}
      </Button>
    </form>
  );
}
