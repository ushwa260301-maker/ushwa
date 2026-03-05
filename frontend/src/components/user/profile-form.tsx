'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/auth.store';

interface ProfileFormValues {
  name: string;
  phone: string;
}

interface ProfileFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ProfileForm({ onSuccess, onCancel }: ProfileFormProps) {
  const { user, setUser } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profilePreview, setProfilePreview] = useState<string | null>(
    user?.profileImage ?? null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data: ProfileFormValues) => {
    setIsSubmitting(true);
    try {
      const res = await usersApi.updateProfile({
        name: data.name,
        phone: data.phone,
        profileImage: profilePreview ?? undefined,
      });
      if (user) {
        setUser({ ...user, name: data.name, phone: data.phone });
      }
      toast.success('프로필이 수정되었습니다');
      onSuccess?.();
    } catch {
      toast.error('프로필 수정에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Profile Image */}
      <div className="flex justify-center">
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
              <span className="text-3xl text-muted-foreground">
                {user?.name?.charAt(0) ?? '?'}
              </span>
            )}
          </div>
          <div className="absolute bottom-0 right-0 size-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md group-hover:bg-primary/90">
            <Camera className="size-4" />
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </label>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          {...register('name', { required: '이름을 입력해주세요' })}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">전화번호</Label>
        <Input
          id="phone"
          placeholder="010-0000-0000"
          {...register('phone', { required: '전화번호를 입력해주세요' })}
        />
        {errors.phone && (
          <p className="text-sm text-destructive">{errors.phone.message}</p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? '저장 중...' : '저장'}
        </Button>
      </div>
    </form>
  );
}
