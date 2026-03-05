'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/stores/auth.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const deliverySchema = z.object({
  recipientName: z.string().min(1, '받는 분 이름을 입력해주세요'),
  recipientPhone: z.string().min(10, '올바른 전화번호를 입력해주세요'),
  address: z.string().min(1, '주소를 입력해주세요'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요'),
  requestedDate: z.string().min(1, '배달 날짜를 선택해주세요'),
  requestedTime: z.string().min(1, '배달 시간을 선택해주세요'),
  message: z.string().optional(),
});

export type DeliveryFormData = z.infer<typeof deliverySchema>;

interface DeliveryFormProps {
  onSubmit: (data: DeliveryFormData) => void;
  formRef?: React.RefObject<HTMLFormElement | null>;
}

export function DeliveryForm({ onSubmit, formRef }: DeliveryFormProps) {
  const user = useAuthStore((s) => s.user);
  const defaultAddress = user?.addresses?.find((a) => a.isDefault);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      recipientName: '',
      recipientPhone: '',
      address: defaultAddress?.address ?? '',
      addressDetail: defaultAddress?.addressDetail ?? '',
      requestedDate: '',
      requestedTime: '',
      message: '',
    },
  });

  const loadAddress = (addr: {
    address: string;
    addressDetail: string;
  }) => {
    setValue('address', addr.address);
    setValue('addressDetail', addr.addressDetail);
  };

  // Get tomorrow as minimum date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <h2 className="text-sm font-bold">배달 정보</h2>

      {/* Saved Addresses */}
      {user?.addresses && user.addresses.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">저장된 주소</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {user.addresses.map((addr) => (
              <Button
                key={addr._id ?? addr.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadAddress(addr)}
                className="shrink-0 text-xs"
              >
                {addr.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="recipientName">받는 분</Label>
          <Input
            id="recipientName"
            placeholder="이름"
            {...register('recipientName')}
            aria-invalid={!!errors.recipientName}
          />
          {errors.recipientName && (
            <p className="text-xs text-destructive">
              {errors.recipientName.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipientPhone">연락처</Label>
          <Input
            id="recipientPhone"
            placeholder="010-0000-0000"
            {...register('recipientPhone')}
            aria-invalid={!!errors.recipientPhone}
          />
          {errors.recipientPhone && (
            <p className="text-xs text-destructive">
              {errors.recipientPhone.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">주소</Label>
        <Input
          id="address"
          placeholder="배달 받을 주소"
          {...register('address')}
          aria-invalid={!!errors.address}
        />
        {errors.address && (
          <p className="text-xs text-destructive">{errors.address.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="addressDetail">상세 주소</Label>
        <Input
          id="addressDetail"
          placeholder="동/호수"
          {...register('addressDetail')}
          aria-invalid={!!errors.addressDetail}
        />
        {errors.addressDetail && (
          <p className="text-xs text-destructive">
            {errors.addressDetail.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="requestedDate">배달 날짜</Label>
          <Input
            id="requestedDate"
            type="date"
            min={minDate}
            {...register('requestedDate')}
            aria-invalid={!!errors.requestedDate}
          />
          {errors.requestedDate && (
            <p className="text-xs text-destructive">
              {errors.requestedDate.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>배달 시간</Label>
          <Select onValueChange={(val) => setValue('requestedTime', val)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="시간대 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="오전 (09:00~12:00)">
                오전 (09:00~12:00)
              </SelectItem>
              <SelectItem value="오후 (12:00~17:00)">
                오후 (12:00~17:00)
              </SelectItem>
              <SelectItem value="저녁 (17:00~21:00)">
                저녁 (17:00~21:00)
              </SelectItem>
            </SelectContent>
          </Select>
          {errors.requestedTime && (
            <p className="text-xs text-destructive">
              {errors.requestedTime.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">배달 메모 (선택)</Label>
        <Textarea
          id="message"
          placeholder="배달 시 참고사항을 적어주세요"
          rows={2}
          className="resize-none"
          {...register('message')}
        />
      </div>
    </form>
  );
}
