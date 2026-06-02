import pg, { type QueryResultRow } from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const message = 'DATABASE_URL is not set. Configure a persistent Postgres database before running the hosted app.';
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    throw new Error(message);
  }
  console.warn(message);
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? false : connectionString?.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
