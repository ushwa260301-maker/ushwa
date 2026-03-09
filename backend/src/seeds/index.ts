import { config } from '../config/env';
import { connectDatabase } from '../config/database';
import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { Category } from '../models/category.model';
import { Shop } from '../models/shop.model';
import { Product } from '../models/product.model';
import { Order } from '../models/order.model';
import { Review } from '../models/review.model';
import { Notification } from '../models/notification.model';
import { seedUsers } from './users.seed';
import { seedCategories } from './categories.seed';
import { seedShops } from './shops.seed';
import { seedProducts } from './products.seed';
import { seedOrders } from './orders.seed';
import { seedReviews } from './reviews.seed';

async function seed() {
  console.log('🌱 시드 데이터 삽입을 시작합니다...\n');

  await connectDatabase();

  // Clear all collections
  console.log('🗑️  기존 데이터 삭제 중...');
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Shop.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Review.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log('✅ 기존 데이터 삭제 완료\n');

  // Seed in order
  const users = await seedUsers();
  const categories = await seedCategories();
  const shops = await seedShops(users, categories);
  const products = await seedProducts(shops, categories);
  const orders = await seedOrders(users, shops, products);
  await seedReviews(users, orders, shops, products);

  // Print demo credentials
  console.log('\n========================================');
  console.log('🌸 어서화 데모 계정 정보');
  console.log('========================================');
  console.log('\n👤 고객 계정:');
  console.log('  이메일: customer1@test.com / 비밀번호: password123');
  console.log('  이메일: customer2@test.com / 비밀번호: password123');
  console.log('  이메일: customer3@test.com / 비밀번호: password123');
  console.log('\n🏪 꽃집 사장님 계정:');
  console.log('  이메일: owner1@test.com / 비밀번호: password123');
  console.log('  이메일: owner2@test.com / 비밀번호: password123');
  console.log('\n👑 관리자 계정:');
  console.log('  이메일: admin@test.com / 비밀번호: password123');
  console.log('========================================\n');

  await mongoose.disconnect();
  console.log('🎉 시드 데이터 삽입 완료!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ 시드 데이터 삽입 실패:', err);
  process.exit(1);
});
