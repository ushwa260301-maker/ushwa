import { Category } from '../models/category.model';

export async function seedCategories() {
  console.log('📂 카테고리 데이터 생성 중...');

  const categoriesData = [
    {
      name: '생일 꽃다발',
      slug: 'birthday',
      icon: 'cake',
      description: '소중한 사람의 생일을 축하하는 꽃다발',
      sortOrder: 1,
      isActive: true,
    },
    {
      name: '프로포즈',
      slug: 'proposal',
      icon: 'heart',
      description: '사랑을 고백하는 특별한 꽃다발',
      sortOrder: 2,
      isActive: true,
    },
    {
      name: '축하/기념일',
      slug: 'celebration',
      icon: 'gift',
      description: '기념일과 축하를 위한 꽃다발',
      sortOrder: 3,
      isActive: true,
    },
    {
      name: '근조/조의',
      slug: 'condolence',
      icon: 'flower-tulip',
      description: '고인을 추모하는 근조 화환',
      sortOrder: 4,
      isActive: true,
    },
    {
      name: '개업/이전',
      slug: 'opening',
      icon: 'store',
      description: '개업과 이전을 축하하는 화환',
      sortOrder: 5,
      isActive: true,
    },
    {
      name: '화분/관엽',
      slug: 'plant',
      icon: 'leaf',
      description: '실내를 꾸미는 화분과 관엽식물',
      sortOrder: 6,
      isActive: true,
    },
    {
      name: '꽃바구니',
      slug: 'basket',
      icon: 'basket',
      description: '선물하기 좋은 꽃바구니',
      sortOrder: 7,
      isActive: true,
    },
    {
      name: '계절 꽃다발',
      slug: 'seasonal',
      icon: 'sun',
      description: '계절에 어울리는 싱그러운 꽃다발',
      sortOrder: 8,
      isActive: true,
    },
  ];

  const categories = await Category.insertMany(categoriesData);
  console.log(`  ✅ 카테고리 ${categories.length}개 생성 완료`);
  return categories;
}
