import { User, IUser } from '../models/user.model';

export async function seedUsers() {
  console.log('👤 사용자 데이터 생성 중...');

  const usersData = [
    // Customers
    {
      email: 'customer1@test.com',
      password: 'password123',
      name: '김민지',
      phone: '010-1234-5678',
      role: 'customer' as const,
      addresses: [
        {
          label: '집',
          address: '서울특별시 강남구 테헤란로 123',
          addressDetail: '아파트 101동 1501호',
          zipCode: '06142',
          coordinates: { lat: 37.5012, lng: 127.0396 },
          isDefault: true,
        },
        {
          label: '회사',
          address: '서울특별시 중구 세종대로 110',
          addressDetail: '서울시청 3층',
          zipCode: '04524',
          coordinates: { lat: 37.5666, lng: 126.9784 },
          isDefault: false,
        },
      ],
    },
    {
      email: 'customer2@test.com',
      password: 'password123',
      name: '이준호',
      phone: '010-2345-6789',
      role: 'customer' as const,
      addresses: [
        {
          label: '집',
          address: '서울특별시 마포구 와우산로 94',
          addressDetail: '홍대 오피스텔 302호',
          zipCode: '04066',
          coordinates: { lat: 37.5563, lng: 126.9236 },
          isDefault: true,
        },
      ],
    },
    {
      email: 'customer3@test.com',
      password: 'password123',
      name: '박서연',
      phone: '010-3456-7890',
      role: 'customer' as const,
      addresses: [
        {
          label: '집',
          address: '서울특별시 송파구 올림픽로 300',
          addressDetail: '잠실 엘스 205동 801호',
          zipCode: '05551',
          coordinates: { lat: 37.5133, lng: 127.1001 },
          isDefault: true,
        },
      ],
    },
    // Shop Owners
    {
      email: 'owner1@test.com',
      password: 'password123',
      name: '최영희',
      phone: '010-4567-8901',
      role: 'owner' as const,
      addresses: [],
    },
    {
      email: 'owner2@test.com',
      password: 'password123',
      name: '정태우',
      phone: '010-5678-9012',
      role: 'owner' as const,
      addresses: [],
    },
    // Admin
    {
      email: 'admin@test.com',
      password: 'password123',
      name: '관리자',
      phone: '010-0000-0000',
      role: 'admin' as const,
      addresses: [],
    },
  ];

  const users = await User.insertMany(usersData);
  console.log(`  ✅ 사용자 ${users.length}명 생성 완료`);

  return {
    customers: users.filter((u) => u.role === 'customer'),
    owners: users.filter((u) => u.role === 'owner'),
    admin: users.find((u) => u.role === 'admin')!,
  };
}
