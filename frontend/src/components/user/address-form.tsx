'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usersApi } from '@/lib/api/users';

interface AddressFormValues {
  label: string;
  address: string;
  addressDetail: string;
  zipCode: string;
  isDefault: boolean;
}

interface AddressFormProps {
  mode: 'add' | 'edit';
  initialData?: {
    _id?: string;
    label: string;
    address: string;
    addressDetail: string;
    zipCode: string;
    isDefault: boolean;
  };
  onSuccess?: () => void;
  onCancel?: () => void;
}

const labelOptions = [
  { value: '집', label: '집' },
  { value: '회사', label: '회사' },
  { value: '기타', label: '기타' },
];

export function AddressForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
}: AddressFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(
    initialData?.label ?? '집',
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressFormValues>({
    defaultValues: {
      label: initialData?.label ?? '집',
      address: initialData?.address ?? '',
      addressDetail: initialData?.addressDetail ?? '',
      zipCode: initialData?.zipCode ?? '',
      isDefault: initialData?.isDefault ?? false,
    },
  });

  const onSubmit = async (data: AddressFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        label: selectedLabel,
        address: data.address,
        addressDetail: data.addressDetail,
        zipCode: data.zipCode,
        coordinates: { lat: 37.5665, lng: 126.978 },
        isDefault: data.isDefault,
      };

      if (mode === 'edit' && initialData?._id) {
        await usersApi.updateAddress(initialData._id, payload);
        toast.success('주소가 수정되었습니다');
      } else {
        await usersApi.addAddress(payload);
        toast.success('주소가 추가되었습니다');
      }
      onSuccess?.();
    } catch {
      toast.error(
        mode === 'edit' ? '주소 수정에 실패했습니다' : '주소 추가에 실패했습니다',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Label Selector */}
      <div className="space-y-2">
        <Label>주소 유형</Label>
        <div className="flex gap-2">
          {labelOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedLabel(opt.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedLabel === opt.value
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-2">
        <Label htmlFor="address">주소</Label>
        <Input
          id="address"
          placeholder="도로명 주소를 입력하세요"
          {...register('address', { required: '주소를 입력해주세요' })}
        />
        {errors.address && (
          <p className="text-sm text-destructive">{errors.address.message}</p>
        )}
      </div>

      {/* Address Detail */}
      <div className="space-y-2">
        <Label htmlFor="addressDetail">상세 주소</Label>
        <Input
          id="addressDetail"
          placeholder="동/호수 등 상세 주소"
          {...register('addressDetail')}
        />
      </div>

      {/* Zip Code */}
      <div className="space-y-2">
        <Label htmlFor="zipCode">우편번호</Label>
        <Input
          id="zipCode"
          placeholder="우편번호"
          {...register('zipCode', { required: '우편번호를 입력해주세요' })}
        />
        {errors.zipCode && (
          <p className="text-sm text-destructive">{errors.zipCode.message}</p>
        )}
      </div>

      {/* Default Address Toggle */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="isDefault"
          {...register('isDefault')}
          className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="isDefault" className="cursor-pointer">
          기본 배송지로 설정
        </Label>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? '저장 중...' : mode === 'edit' ? '수정' : '추가'}
        </Button>
      </div>
    </form>
  );
}
