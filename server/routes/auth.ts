import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { sendMail } from '../lib/mail.js';
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

const resetRequestSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

let resetSchemaReady = false;

async function ensurePasswordResetSchema() {
  if (resetSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)');
  resetSchemaReady = true;
}

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function appBaseUrl(req: any) {
  const configured = process.env.APP_URL || process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export async function sendPasswordResetEmail(req: any, user: { id: string; email: string }) {
  await ensurePasswordResetSchema();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  await query(
    `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
     VALUES($1, $2, now() + interval '1 hour')`,
    [user.id, tokenHash],
  );

  const baseUrl = appBaseUrl(req);
  const resetUrl = `${baseUrl}/?reset_token=${encodeURIComponent(token)}`;
  return sendMail(
    user.email,
    'Reset your WARREN Quote Tool password',
    `Use this link to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  );
}

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

authRouter.post('/forgot-password', async (req, res) => {
  const parsed = resetRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
  const email = parsed.data.email.toLowerCase();

  await ensurePasswordResetSchema();
  const user = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = $1', [email]);
  const row = user.rows[0];
  if (row) {
    try {
      await sendPasswordResetEmail(req, row);
    } catch (err) {
      console.error('Password reset email failed', err);
    }
  }

  return res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

authRouter.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Enter a new password with at least 8 characters.' });

  await ensurePasswordResetSchema();
  const tokenHash = hashResetToken(parsed.data.token);
  const found = await query<{ id: string; user_id: string; email: string }>(
    `SELECT prt.id, prt.user_id, u.email
     FROM password_reset_tokens prt
     JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = $1
       AND prt.used_at IS NULL
       AND prt.expires_at > now()
     LIMIT 1`,
    [tokenHash],
  );
  const row = found.rows[0];
  if (!row) return res.status(400).json({ ok: false, error: 'Reset link is invalid or expired.' });

  const hash = await bcrypt.hash(parsed.data.password, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, row.user_id]);
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
  return res.json({ ok: true, message: 'Password reset. You can sign in now.' });
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const accounts = await getUserAccounts(req.user!.id);
  return res.json({ ok: true, user: { ...req.user, is_admin: await isAdminUser(req.user!) }, accounts });
});
