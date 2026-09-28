import { createLocalD1Database } from './localD1';
import { getDb } from './index';
import { seedDatabase } from './seed';

async function main() {
  console.log('🌱 Seeding local development D1 database...');
  const localD1 = createLocalD1Database();
  const db = getDb(localD1);
  await seedDatabase(db);
  console.log('✅ Local database seed complete!');
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
