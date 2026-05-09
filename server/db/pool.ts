import pg, { type QueryResultRow } from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database calls will fail until it is configured.');
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? false : connectionString?.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
