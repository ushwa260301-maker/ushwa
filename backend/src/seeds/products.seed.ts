import { Product } from '../models/product.model';

export async function seedProducts(shops: any[], categories: any[]) {
  console.log('🌷 상품 데이터 생성 중...');

  const catMap: Record<string, string> = {};
  for (const c of categories) {
    catMap[c.slug] = c._id.toString();
  }

  const sizeOption = {
    name: '사이즈',
    values: [
      { label: '스몰', price: 0 },
      { label: '미디엄', price: 15000 },
      { label: '라지', price: 30000 },
    ],
  };

  const commonAddOns = [
    { name: '곰돌이 인형', price: 15000, isAvailable: true },
    { name: '고디바 초콜릿', price: 12000, isAvailable: true },
    { name: '풍선 세트', price: 8000, isAvailable: true },
    { name: '프리미엄 리본', price: 3000, isAvailable: true },
  ];

  const allProducts: any[] = [];

  // Shop 0: 꽃다발 정원 (강남)
  const shop0 = shops[0];
  allProducts.push(
    {
      shop: shop0._id, category: catMap['birthday'],
      name: '로맨틱 레드 로즈 꽃다발', description: '빨간 장미로 가득한 로맨틱한 꽃다발, 생일 선물로 최고입니다.',
      price: 45000, salePrice: 39000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미'], occasion: ['생일', '기념일'], tags: ['베스트', '인기'],
      rating: { average: 4.8, count: 45 }, salesCount: 234, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop0._id, category: catMap['proposal'],
      name: '프로포즈 100송이 장미', description: '100송이 빨간 장미로 사랑을 전하세요. 프로포즈에 가장 인기있는 꽃다발입니다.',
      price: 150000, images: [], thumbnail: '',
      options: [{ name: '송이수', values: [{ label: '50송이', price: 0 }, { label: '100송이', price: 50000 }, { label: '200송이', price: 120000 }] }],
      addOns: [...commonAddOns, { name: '메시지 배너', price: 20000, isAvailable: true }],
      flowers: ['장미'], occasion: ['프로포즈', '기념일'], tags: ['프리미엄'],
      rating: { average: 4.9, count: 28 }, salesCount: 89, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop0._id, category: catMap['celebration'],
      name: '축하 혼합 꽃바구니', description: '다양한 꽃으로 구성된 화려한 축하 꽃바구니입니다.',
      price: 55000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미', '거베라', '카네이션'], occasion: ['축하', '개업'], tags: [],
      rating: { average: 4.5, count: 32 }, salesCount: 156, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop0._id, category: catMap['seasonal'],
      name: '봄 튤립 꽃다발', description: '봄의 싱그러움을 담은 튤립 꽃다발, 계절 한정 상품입니다.',
      price: 35000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(0, 2),
      flowers: ['튤립'], occasion: ['선물', '생일'], tags: ['계절한정', '봄'],
      rating: { average: 4.7, count: 18 }, salesCount: 67, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop0._id, category: catMap['plant'],
      name: '몬스테라 화분', description: '공기정화 능력이 뛰어난 몬스테라 화분, 집들이 선물로 좋습니다.',
      price: 32000, images: [], thumbnail: '',
      options: [{ name: '화분 크기', values: [{ label: '소형', price: 0 }, { label: '중형', price: 15000 }, { label: '대형', price: 35000 }] }],
      addOns: [{ name: '화분 커버', price: 5000, isAvailable: true }],
      flowers: ['몬스테라'], occasion: ['집들이', '선물'], tags: ['공기정화'],
      rating: { average: 4.6, count: 22 }, salesCount: 98, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop0._id, category: catMap['birthday'],
      name: '파스텔 혼합 꽃다발', description: '파스텔톤 꽃들로 구성된 사랑스러운 꽃다발입니다.',
      price: 42000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미', '리시안셔스', '안개꽃'], occasion: ['생일', '기념일'], tags: ['인기'],
      rating: { average: 4.7, count: 36 }, salesCount: 178, isAvailable: true, isFeatured: true,
    },
  );

  // Shop 1: 로즈마리 플라워 (홍대)
  const shop1 = shops[1];
  allProducts.push(
    {
      shop: shop1._id, category: catMap['birthday'],
      name: '홍대 감성 혼합 부케', description: '홍대 특유의 감성을 담은 트렌디한 혼합 부케입니다.',
      price: 48000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미', '라넌큘러스', '유칼립투스'], occasion: ['생일', '선물'], tags: ['트렌디', '감성'],
      rating: { average: 4.9, count: 67 }, salesCount: 345, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop1._id, category: catMap['seasonal'],
      name: '해바라기 꽃다발', description: '밝고 환한 해바라기로 마음을 전하세요.',
      price: 38000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(0, 3),
      flowers: ['해바라기'], occasion: ['축하', '선물'], tags: ['여름', '밝은'],
      rating: { average: 4.8, count: 41 }, salesCount: 198, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop1._id, category: catMap['basket'],
      name: '프리지아 꽃바구니', description: '향기로운 프리지아를 가득 담은 꽃바구니입니다.',
      price: 52000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['프리지아', '안개꽃'], occasion: ['축하', '기념일'], tags: ['향기'],
      rating: { average: 4.6, count: 29 }, salesCount: 112, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop1._id, category: catMap['celebration'],
      name: '미니 꽃다발 세트 (3개입)', description: '소중한 사람들에게 나눠줄 수 있는 미니 꽃다발 3개 세트입니다.',
      price: 35000, images: [], thumbnail: '',
      options: [], addOns: [{ name: '메시지 카드', price: 2000, isAvailable: true }],
      flowers: ['장미', '카네이션', '데이지'], occasion: ['축하', '감사'], tags: ['세트', '가성비'],
      rating: { average: 4.4, count: 53 }, salesCount: 267, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop1._id, category: catMap['birthday'],
      name: '라벤더 드라이플라워', description: '오래 보관할 수 있는 라벤더 드라이플라워 꽃다발입니다.',
      price: 28000, images: [], thumbnail: '',
      options: [{ name: '타입', values: [{ label: '미니 다발', price: 0 }, { label: '풀 다발', price: 12000 }] }],
      addOns: [{ name: '유리 꽃병', price: 8000, isAvailable: true }],
      flowers: ['라벤더'], occasion: ['생일', '인테리어'], tags: ['드라이플라워'],
      rating: { average: 4.5, count: 44 }, salesCount: 189, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop1._id, category: catMap['seasonal'],
      name: '벚꽃 스페셜 부케', description: '봄 한정! 벚꽃 가지와 장미의 특별한 조합입니다.',
      price: 55000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['벚꽃', '장미'], occasion: ['봄', '선물'], tags: ['한정판', '봄'],
      rating: { average: 4.9, count: 15 }, salesCount: 45, isAvailable: true, isFeatured: true,
    },
  );

  // Shop 2: 블루밍 스튜디오 (종로)
  const shop2 = shops[2];
  allProducts.push(
    {
      shop: shop2._id, category: catMap['proposal'],
      name: '프리미엄 웨딩 부케', description: '웨딩에 어울리는 화이트 & 블러시 톤의 프리미엄 부케입니다.',
      price: 120000, images: [], thumbnail: '',
      options: [{ name: '스타일', values: [{ label: '라운드', price: 0 }, { label: '캐스케이드', price: 20000 }, { label: '클러치', price: 10000 }] }],
      addOns: [{ name: '부토니에', price: 15000, isAvailable: true }, { name: '코사지', price: 12000, isAvailable: true }],
      flowers: ['백장미', '작약', '리시안셔스'], occasion: ['웨딩', '프로포즈'], tags: ['프리미엄', '웨딩'],
      rating: { average: 4.8, count: 19 }, salesCount: 56, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop2._id, category: catMap['condolence'],
      name: '근조 화환 (3단)', description: '고인의 명복을 비는 격식 있는 3단 근조 화환입니다.',
      price: 80000, images: [], thumbnail: '',
      options: [{ name: '크기', values: [{ label: '2단', price: 0 }, { label: '3단', price: 30000 }, { label: '특대', price: 60000 }] }],
      addOns: [{ name: '리본 문구', price: 5000, isAvailable: true }],
      flowers: ['국화', '백합'], occasion: ['근조', '조의'], tags: ['근조'],
      rating: { average: 4.4, count: 14 }, salesCount: 78, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop2._id, category: catMap['celebration'],
      name: '백합 축하 꽃다발', description: '우아한 백합으로 축하의 마음을 전하세요.',
      price: 58000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['백합'], occasion: ['축하', '기념일'], tags: ['우아한'],
      rating: { average: 4.6, count: 25 }, salesCount: 134, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop2._id, category: catMap['celebration'],
      name: '카네이션 감사 바구니', description: '부모님께 감사의 마음을 담은 카네이션 바구니입니다.',
      price: 45000, salePrice: 38000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(1),
      flowers: ['카네이션'], occasion: ['어버이날', '감사'], tags: ['효도', '감사'],
      rating: { average: 4.7, count: 58 }, salesCount: 312, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop2._id, category: catMap['birthday'],
      name: '작약 꽃다발', description: '풍성하고 화려한 작약 꽃다발, 특별한 날에 어울립니다.',
      price: 65000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['작약'], occasion: ['생일', '기념일'], tags: ['프리미엄'],
      rating: { average: 4.8, count: 21 }, salesCount: 87, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop2._id, category: catMap['opening'],
      name: '개업 축하 화환', description: '새로운 시작을 축하하는 화려한 개업 화환입니다.',
      price: 70000, images: [], thumbnail: '',
      options: [{ name: '크기', values: [{ label: '기본', price: 0 }, { label: '대형', price: 30000 }] }],
      addOns: [{ name: '축하 현수막', price: 10000, isAvailable: true }],
      flowers: ['장미', '거베라', '글라디올러스'], occasion: ['개업', '이전'], tags: ['개업'],
      rating: { average: 4.3, count: 16 }, salesCount: 45, isAvailable: true, isFeatured: false,
    },
  );

  // Shop 3: 해피 플라워 (잠실)
  const shop3 = shops[3];
  allProducts.push(
    {
      shop: shop3._id, category: catMap['birthday'],
      name: '가성비 생일 꽃다발', description: '합리적인 가격의 예쁜 생일 꽃다발입니다.',
      price: 25000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(0, 3),
      flowers: ['장미', '카네이션', '안개꽃'], occasion: ['생일'], tags: ['가성비', '인기'],
      rating: { average: 4.3, count: 89 }, salesCount: 567, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop3._id, category: catMap['plant'],
      name: '다육이 세트 (5개입)', description: '귀여운 다육식물 5종 세트, 관리가 쉬워 선물용으로 좋습니다.',
      price: 22000, images: [], thumbnail: '',
      options: [], addOns: [{ name: '미니 화분 세트', price: 8000, isAvailable: true }],
      flowers: ['다육식물'], occasion: ['집들이', '선물'], tags: ['다육이', '쉬운관리'],
      rating: { average: 4.5, count: 71 }, salesCount: 423, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop3._id, category: catMap['opening'],
      name: '소형 축하 화환', description: '작은 공간에도 어울리는 소형 축하 화환입니다.',
      price: 45000, images: [], thumbnail: '',
      options: [{ name: '크기', values: [{ label: '소형', price: 0 }, { label: '중형', price: 20000 }] }],
      addOns: [{ name: '축하 카드', price: 3000, isAvailable: true }],
      flowers: ['장미', '거베라'], occasion: ['개업', '축하'], tags: ['소형'],
      rating: { average: 4.2, count: 34 }, salesCount: 156, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop3._id, category: catMap['basket'],
      name: '과일 & 꽃 바구니', description: '신선한 과일과 꽃이 함께 담긴 특별한 선물 바구니입니다.',
      price: 65000, images: [], thumbnail: '',
      options: [{ name: '크기', values: [{ label: '기본', price: 0 }, { label: '대형', price: 25000 }] }],
      addOns: [{ name: '와인 추가', price: 25000, isAvailable: true }],
      flowers: ['장미', '거베라'], occasion: ['병문안', '선물'], tags: ['과일', '선물세트'],
      rating: { average: 4.6, count: 28 }, salesCount: 134, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop3._id, category: catMap['plant'],
      name: '행운목 화분', description: '행운을 가져다주는 행운목, 개업 선물로 인기입니다.',
      price: 28000, images: [], thumbnail: '',
      options: [{ name: '크기', values: [{ label: '미니', price: 0 }, { label: '중형', price: 12000 }] }],
      addOns: [], flowers: ['행운목'], occasion: ['개업', '집들이'], tags: ['행운'],
      rating: { average: 4.4, count: 19 }, salesCount: 87, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop3._id, category: catMap['seasonal'],
      name: '수국 꽃다발', description: '싱그러운 수국으로 만든 볼륨감 있는 꽃다발입니다.',
      price: 40000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(0, 2),
      flowers: ['수국'], occasion: ['선물', '생일'], tags: ['여름', '볼륨'],
      rating: { average: 4.7, count: 33 }, salesCount: 145, isAvailable: true, isFeatured: false,
    },
  );

  // Shop 4: 소담 꽃방 (이태원)
  const shop4 = shops[4];
  allProducts.push(
    {
      shop: shop4._id, category: catMap['seasonal'],
      name: '이태원 시그니처 부케', description: '소담 꽃방의 시그니처 혼합 부케, 유니크한 컬러 조합이 특징입니다.',
      price: 52000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미', '라넌큘러스', '스카비오사'], occasion: ['선물', '기념일'], tags: ['시그니처', '유니크'],
      rating: { average: 4.9, count: 48 }, salesCount: 234, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop4._id, category: catMap['basket'],
      name: '프렌치 스타일 꽃바구니', description: '프랑스 감성의 꽃바구니, 인테리어 소품으로도 좋습니다.',
      price: 58000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns,
      flowers: ['장미', '유칼립투스', '안개꽃'], occasion: ['선물', '인테리어'], tags: ['프렌치', '감성'],
      rating: { average: 4.8, count: 35 }, salesCount: 167, isAvailable: true, isFeatured: true,
    },
    {
      shop: shop4._id, category: catMap['birthday'],
      name: '컬러풀 거베라 다발', description: '다양한 컬러의 거베라로 밝은 에너지를 선물하세요.',
      price: 32000, images: [], thumbnail: '',
      options: [sizeOption], addOns: commonAddOns.slice(0, 3),
      flowers: ['거베라'], occasion: ['생일', '축하'], tags: ['밝은', '컬러풀'],
      rating: { average: 4.5, count: 27 }, salesCount: 145, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop4._id, category: catMap['celebration'],
      name: '안개꽃 가득 다발', description: '순수하고 청순한 안개꽃으로 가득 채운 꽃다발입니다.',
      price: 28000, images: [], thumbnail: '',
      options: [{ name: '사이즈', values: [{ label: '미니', price: 0 }, { label: '풀', price: 10000 }] }],
      addOns: [{ name: '메시지 카드', price: 2000, isAvailable: true }, { name: '리본', price: 3000, isAvailable: true }],
      flowers: ['안개꽃'], occasion: ['졸업', '축하'], tags: ['순수', '청순'],
      rating: { average: 4.6, count: 42 }, salesCount: 198, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop4._id, category: catMap['celebration'],
      name: '졸업 축하 꽃다발', description: '졸업을 축하하는 특별한 꽃다발, 인생샷을 위한 포토제닉 디자인입니다.',
      price: 38000, images: [], thumbnail: '',
      options: [sizeOption], addOns: [...commonAddOns, { name: '졸업 축하 토퍼', price: 5000, isAvailable: true }],
      flowers: ['장미', '튤립', '안개꽃'], occasion: ['졸업', '축하'], tags: ['졸업', '포토제닉'],
      rating: { average: 4.7, count: 31 }, salesCount: 178, isAvailable: true, isFeatured: false,
    },
    {
      shop: shop4._id, category: catMap['proposal'],
      name: '블루 로즈 프로포즈 세트', description: '희귀한 블루 로즈로 만든 특별한 프로포즈 세트입니다.',
      price: 89000, images: [], thumbnail: '',
      options: [{ name: '송이수', values: [{ label: '12송이', price: 0 }, { label: '36송이', price: 40000 }, { label: '99송이', price: 100000 }] }],
      addOns: [{ name: '반지 보관함', price: 10000, isAvailable: true }, ...commonAddOns],
      flowers: ['블루 로즈'], occasion: ['프로포즈'], tags: ['프리미엄', '희귀'],
      rating: { average: 5.0, count: 8 }, salesCount: 23, isAvailable: true, isFeatured: true,
    },
  );

  const products = await Product.insertMany(allProducts);
  console.log(`  ✅ 상품 ${products.length}개 생성 완료`);
  return products;
}
