import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../../config/database.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  logger.info('Starting database migrations...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await query(schemaSql);
    logger.info('Database migrations applied successfully!');
  } catch (error) {
    logger.error({ error: error.message }, 'Migration execution failed');
    throw error;
  }
}

// Allow standalone execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      logger.info('Migration complete.');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed.');
      pool.end();
      process.exit(1);
    });
}

export default runMigrations;
