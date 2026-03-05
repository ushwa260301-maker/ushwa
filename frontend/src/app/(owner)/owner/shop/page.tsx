'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { Camera, Save } from 'lucide-react';
import { toast } from 'sonner';
import { shopsApi } from '@/lib/api/shops';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

interface ShopFormValues {
  name: string;
  description: string;
  phone: string;
  address: string;
  deliveryFee: string;
  minOrderAmount: string;
  deliveryRadius: string;
  estimatedDeliveryTime: string;
}

const days = ['월', '화', '수', '목', '금', '토', '일'];

interface OperatingHour {
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export default function OwnerShopPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [operatingHours, setOperatingHours] = useState<OperatingHour[]>(
    days.map(() => ({ isOpen: true, openTime: '09:00', closeTime: '21:00' })),
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ShopFormValues>();

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const res = await shopsApi.getAnalytics();
        const shop = res.data?.shop;
        if (shop) {
          reset({
            name: shop.name ?? '',
            description: shop.description ?? '',
            phone: shop.phone ?? '',
            address: shop.address ?? '',
            deliveryFee: shop.deliveryFee?.toString() ?? '3000',
            minOrderAmount: shop.minOrderAmount?.toString() ?? '0',
            deliveryRadius: shop.deliveryRadius?.toString() ?? '5',
            estimatedDeliveryTime: shop.estimatedDeliveryTime?.toString() ?? '60',
          });
          if (shop.profileImage) setProfilePreview(shop.profileImage);
          if (shop.coverImage) setCoverPreview(shop.coverImage);
          if (shop.operatingHours) setOperatingHours(shop.operatingHours);
        }
      } catch {
        // New shop, use defaults
      } finally {
        setIsLoading(false);
      }
    };
    fetchShop();
  }, [reset]);

  const handleProfileImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setProfilePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setCoverPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const updateOperatingHour = (
    index: number,
    field: keyof OperatingHour,
    value: string | boolean,
  ) => {
    setOperatingHours((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
    );
  };

  const onSubmit = async (data: ShopFormValues) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('description', data.description);
      formData.append('phone', data.phone);
      formData.append('address', data.address);
      formData.append('deliveryFee', data.deliveryFee);
      formData.append('minOrderAmount', data.minOrderAmount);
      formData.append('deliveryRadius', data.deliveryRadius);
      formData.append('estimatedDeliveryTime', data.estimatedDeliveryTime);
      formData.append('operatingHours', JSON.stringify(operatingHours));

      if (profileFile) formData.append('profileImage', profileFile);
      if (coverFile) formData.append('coverImage', coverFile);

      await shopsApi.updateMyShop(formData);
      toast.success('가게 정보가 저장되었습니다');
    } catch {
      toast.error('저장에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">가게 설정</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Images */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-bold">가게 이미지</h2>
          <div className="flex gap-6">
            {/* Profile Image */}
            <div className="text-center">
              <label className="relative cursor-pointer group">
                <div className="size-24 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                  {profilePreview ? (
                    <Image
                      src={profilePreview}
                      alt="프로필"
                      width={96}
                      height={96}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <Camera className="size-8 text-muted-foreground" />
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileImage} />
              </label>
              <p className="text-xs text-muted-foreground mt-2">프로필</p>
            </div>

            {/* Cover Image */}
            <div className="flex-1">
              <label className="cursor-pointer block">
                <div className="h-24 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                  {coverPreview ? (
                    <Image
                      src={coverPreview}
                      alt="커버"
                      width={400}
                      height={96}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <Camera className="size-8 text-muted-foreground" />
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverImage} />
              </label>
              <p className="text-xs text-muted-foreground mt-2">커버 이미지</p>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-bold">기본 정보</h2>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">가게명</Label>
              <Input id="name" {...register('name', { required: '가게명을 입력해주세요' })} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">소개</Label>
              <Textarea id="description" rows={3} {...register('description')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">전화번호</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">주소</Label>
              <Input id="address" {...register('address')} />
            </div>
          </div>
        </div>

        {/* Operating Hours */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-bold">영업시간</h2>
          <div className="space-y-2">
            {days.map((day, idx) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-8 text-sm font-medium">{day}</span>
                <input
                  type="checkbox"
                  checked={operatingHours[idx].isOpen}
                  onChange={(e) =>
                    updateOperatingHour(idx, 'isOpen', e.target.checked)
                  }
                  className="size-4"
                />
                {operatingHours[idx].isOpen ? (
                  <>
                    <Input
                      type="time"
                      value={operatingHours[idx].openTime}
                      onChange={(e) =>
                        updateOperatingHour(idx, 'openTime', e.target.value)
                      }
                      className="w-32"
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="time"
                      value={operatingHours[idx].closeTime}
                      onChange={(e) =>
                        updateOperatingHour(idx, 'closeTime', e.target.value)
                      }
                      className="w-32"
                    />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">휴무</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Settings */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="font-bold">배달 설정</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deliveryFee">배달비 (원)</Label>
              <Input id="deliveryFee" type="number" {...register('deliveryFee')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minOrderAmount">최소 주문금액 (원)</Label>
              <Input id="minOrderAmount" type="number" {...register('minOrderAmount')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliveryRadius">배달 반경 (km)</Label>
              <Input id="deliveryRadius" type="number" {...register('deliveryRadius')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedDeliveryTime">예상 배달시간 (분)</Label>
              <Input id="estimatedDeliveryTime" type="number" {...register('estimatedDeliveryTime')} />
            </div>
          </div>
        </div>

        <Separator />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          <Save className="size-4 mr-2" />
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </form>
    </div>
  );
}
