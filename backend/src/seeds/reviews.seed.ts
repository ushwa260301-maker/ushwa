import { Review } from '../models/review.model';

export async function seedReviews(
  users: { customers: any[] },
  orders: any[],
  shops: any[],
  products: any[],
) {
  console.log('⭐ 리뷰 데이터 생성 중...');

  const deliveredOrders = orders.filter((o: any) => o.status === 'delivered');
  const [c1, c2, c3] = users.customers;

  const reviewsData = [
    {
      order: deliveredOrders[0]._id,
      customer: c1._id,
      shop: deliveredOrders[0].shop,
      product: deliveredOrders[0].items[0].product,
      rating: 5,
      content: '꽃이 정말 신선하고 예뻤어요! 포장도 꼼꼼하게 해주셔서 감동받았습니다. 다음에도 꼭 여기서 주문할게요!',
      images: [],
      ownerReply: {
        content: '소중한 리뷰 감사합니다! 더 좋은 꽃으로 보답하겠습니다 💐',
        createdAt: new Date(),
      },
      isActive: true,
    },
    {
      order: deliveredOrders[1]._id,
      customer: c2._id,
      shop: deliveredOrders[1].shop,
      product: deliveredOrders[1].items[0].product,
      rating: 5,
      content: '홍대 감성 그대로! 꽃다발이 너무 예쁘고 센스있었습니다. 여자친구가 정말 좋아했어요.',
      images: [],
      ownerReply: {
        content: '여자친구분이 좋아하셨다니 저희도 기뻐요! 감사합니다 🌹',
        createdAt: new Date(),
      },
      isActive: true,
    },
    {
      order: deliveredOrders[2]._id,
      customer: c3._id,
      shop: deliveredOrders[2].shop,
      product: deliveredOrders[2].items[0].product,
      rating: 4,
      content: '백합이 우아하고 좋았습니다. 배달도 시간 맞춰 와서 좋았어요. 다만 배달비가 조금 아쉽네요.',
      images: [],
      isActive: true,
    },
    {
      order: deliveredOrders[3]._id,
      customer: c1._id,
      shop: deliveredOrders[3].shop,
      product: deliveredOrders[3].items[0].product,
      rating: 5,
      content: '시그니처 부케 너무 예뻐요! 색감 조합이 정말 특별하고 유니크했습니다. 강력 추천합니다!',
      images: [],
      ownerReply: {
        content: '감사합니다! 저희 시그니처 부케를 좋아해주셔서 영광입니다 ✨',
        createdAt: new Date(),
      },
      isActive: true,
    },
    {
      order: deliveredOrders[4]._id,
      customer: c2._id,
      shop: deliveredOrders[4].shop,
      product: deliveredOrders[4].items[0].product,
      rating: 4,
      content: '가성비가 좋아요! 가격 대비 꽃다발이 예쁘게 나왔습니다. 어머니께서 좋아하셨어요.',
      images: [],
      isActive: true,
    },
  ];

  const reviews = await Review.insertMany(reviewsData);
  console.log(`  ✅ 리뷰 ${reviews.length}개 생성 완료`);
  return reviews;
}
