import type { NextFunction, Response } from 'express';
import { query } from '../db/pool.js';
import type { AuthRequest } from './auth.js';

function configuredAdminEmails() {
  return String(process.env.WARREN_ADMIN_EMAILS || process.env.TQT_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  const emails = configuredAdminEmails();
  if (emails.length) return emails.includes(normalized);
  return process.env.NODE_ENV !== 'production' && normalized.endsWith('@example.com');
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !isAdminEmail(req.user.email)) {
    return res.status(403).json({ ok: false, error: 'Admin access required.' });
  }
  const found = await query('SELECT 1 FROM users WHERE id = $1 AND lower(email) = lower($2)', [req.user.id, req.user.email]);
  if (!found.rowCount) return res.status(403).json({ ok: false, error: 'Admin access required.' });
  next();
}
