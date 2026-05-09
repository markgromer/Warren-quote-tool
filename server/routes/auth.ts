import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { createDefaultAccount, getUserAccounts } from '../lib/repo.js';
import { requireAuth, signToken, type AuthRequest } from '../middleware/auth.js';
import { isAdminUser } from '../middleware/admin.js';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional().default(''),
  businessName: z.string().optional().default('My business'),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: parsed.error.flatten() });
  const { email, password, name, businessName } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  try {
    const user = await query<{ id: string; email: string }>(
      'INSERT INTO users(email, password_hash, name) VALUES($1, $2, $3) RETURNING id, email',
      [email.toLowerCase(), hash, name],
    );
    await createDefaultAccount(user.rows[0].id, businessName);
    return res.json({ ok: true, token: signToken(user.rows[0]), user: user.rows[0] });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err?.code === '23505' ? 'Email already exists.' : 'Could not create account.' });
  }
});

authRouter.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase();
  const password = String(req.body?.password || '');
  const user = await query<{ id: string; email: string; password_hash: string }>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
  const row = user.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }
  return res.json({ ok: true, token: signToken({ id: row.id, email: row.email }), user: { id: row.id, email: row.email } });
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const accounts = await getUserAccounts(req.user!.id);
  return res.json({ ok: true, user: { ...req.user, is_admin: await isAdminUser(req.user!) }, accounts });
});
