import type { NextFunction, Response } from 'express';
import { query } from '../db/pool.js';
import type { AuthRequest } from './auth.js';

function configuredAdminEmails() {
  return String(process.env.WARREN_ADMIN_EMAILS || process.env.TQT_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

async function isFirstUser(userId: string) {
  const first = await query<{ id: string }>('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1');
  return !!first.rowCount && first.rows[0].id === userId;
}

export function isAdminEmail(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  const emails = configuredAdminEmails();
  if (emails.length) return emails.includes(normalized);
  return process.env.NODE_ENV !== 'production' && normalized.endsWith('@example.com');
}

export async function isAdminUser(user: { id: string; email: string }) {
  if (!user) return false;
  const emails = configuredAdminEmails();
  if (emails.length) return isAdminEmail(user.email);
  if (process.env.NODE_ENV !== 'production' && isAdminEmail(user.email)) return true;
  return isFirstUser(user.id);
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !(await isAdminUser(req.user))) {
    return res.status(403).json({ ok: false, error: 'Admin access required.' });
  }
  const found = await query('SELECT 1 FROM users WHERE id = $1 AND lower(email) = lower($2)', [req.user.id, req.user.email]);
  if (!found.rowCount) return res.status(403).json({ ok: false, error: 'Admin access required.' });
  next();
}
