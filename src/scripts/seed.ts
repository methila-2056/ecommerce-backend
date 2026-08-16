import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { logger } from '../config/logger.js';
import { seedDemoData } from './seed-data.js';

async function main(): Promise<void> {
  await connectDatabase();
  await seedDemoData();
  await disconnectDatabase();
  logger.info('Seed complete');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
