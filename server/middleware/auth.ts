import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AuthRequest = Request & { user?: { id: string; email: string } };

export function signToken(user: { id: string; email: string }) {
  return jwt.sign(user, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '30d' });
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid token.' });
  }
}
