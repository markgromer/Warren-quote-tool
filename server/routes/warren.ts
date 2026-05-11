import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';

export const warrenRouter = Router();

let schemaReady = false;

function stableStringify(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function appBaseUrl(req: any) {
  const configured = process.env.APP_URL || process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '';
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

async function ensureWarrenSchema() {
  if (schemaReady) return;
  await query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS external_source TEXT NOT NULL DEFAULT ''");
  await query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT ''");
  await query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS external_slug TEXT NOT NULL DEFAULT ''");
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_external_source_id ON accounts(external_source, external_id) WHERE external_source <> '' AND external_id <> ''");
  schemaReady = true;
}

function verifyProvisionSignature(body: any, timestamp: string, signature: string) {
  const secret = process.env.TITAN_QUOTE_TOOL_PROVISION_SECRET || process.env.WARREN_PROVISION_SECRET || process.env.WARREN_SHARED_SECRET || '';
  if (!secret) return false;
  const ts = Number(timestamp || 0);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${stableStringify(body)}`)
    .digest('hex');
  const incoming = String(signature || '').replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(incoming, 'hex'));
  } catch {
    return false;
  }
}

warrenRouter.post('/provision', async (req, res) => {
  const timestamp = String(req.header('x-warren-timestamp') || '');
  const signature = String(req.header('x-warren-signature') || '');
  if (!verifyProvisionSignature(req.body || {}, timestamp, signature)) {
    return res.status(401).json({ ok: false, error: 'Invalid WARREN provisioning signature.' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const businessName = String(req.body?.business_name || req.body?.businessName || 'WARREN business').trim();
  const warrenBrandId = String(req.body?.warren_brand_id || '').trim();
  const warrenBrandSlug = String(req.body?.warren_brand_slug || '').trim();
  const warrenActive = Boolean(req.body?.warren_active);
  const settings = req.body?.settings && typeof req.body.settings === 'object' && !Array.isArray(req.body.settings) ? req.body.settings : {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email is required.' });
  }
  if (!warrenBrandId || !warrenActive) {
    return res.status(403).json({ ok: false, error: 'Active WARREN brand is required.' });
  }

  await ensureWarrenSchema();

  let user = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE email = $1 LIMIT 1', [email]);
  if (!user.rowCount) {
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12);
    user = await query<{ id: string; email: string }>(
      'INSERT INTO users(email, password_hash, name) VALUES($1, $2, $3) RETURNING id, email',
      [email, hash, name],
    );
  } else if (name) {
    await query('UPDATE users SET name = COALESCE(NULLIF($1, \'\'), name), updated_at = now() WHERE id = $2', [name, user.rows[0].id]);
  }
  const userRow = user.rows[0];

  let account = await query<{ id: string }>(
    "SELECT id FROM accounts WHERE external_source = 'warren' AND external_id = $1 LIMIT 1",
    [warrenBrandId],
  );
  if (!account.rowCount) {
    account = await query<{ id: string }>(
      `INSERT INTO accounts(name, plan, billing_status, addons, external_source, external_id, external_slug)
       VALUES($1, 'pro', 'active', $2, 'warren', $3, $4)
       RETURNING id`,
      [
        businessName || 'WARREN business',
        {
          warren_included: true,
          provisioned_from: 'warren',
          warren_brand_slug: warrenBrandSlug,
          provisioned_at: new Date().toISOString(),
        },
        warrenBrandId,
        warrenBrandSlug,
      ],
    );
  } else {
    await query(
      `UPDATE accounts
       SET name = COALESCE(NULLIF($1, ''), name),
           plan = 'pro',
           billing_status = 'active',
           addons = addons || $2::jsonb,
           external_slug = $3,
           updated_at = now()
       WHERE id = $4`,
      [
        businessName,
        {
          warren_included: true,
          provisioned_from: 'warren',
          warren_brand_slug: warrenBrandSlug,
          last_provisioned_at: new Date().toISOString(),
        },
        warrenBrandSlug,
        account.rows[0].id,
      ],
    );
  }
  const accountId = account.rows[0].id;

  await query(
    `INSERT INTO account_members(account_id, user_id, role)
     VALUES($1, $2, 'owner')
     ON CONFLICT(account_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [accountId, userRow.id],
  );

  const widget = await query<{ id: string; public_id: string }>(
    'SELECT id, public_id FROM widgets WHERE account_id = $1 ORDER BY created_at ASC LIMIT 1',
    [accountId],
  );
  let widgetRow = widget.rows[0];
  if (!widgetRow) {
    const publicId = `wid_${crypto.randomBytes(12).toString('hex')}`;
    const created = await query<{ id: string; public_id: string }>(
      'INSERT INTO widgets(account_id, public_id, name, enabled, settings) VALUES($1, $2, $3, true, $4) RETURNING id, public_id',
      [accountId, publicId, 'WARREN Pro widget', { ...settings, brand_name: businessName, lead_destination: settings.lead_destination || 'warren' }],
    );
    widgetRow = created.rows[0];
  } else {
    await query(
      `UPDATE widgets
       SET settings = settings || $1::jsonb,
           enabled = true,
           updated_at = now()
       WHERE id = $2`,
      [{ ...settings, brand_name: businessName }, widgetRow.id],
    );
  }

  const token = signToken({ id: userRow.id, email: userRow.email });
  const baseUrl = appBaseUrl(req);
  return res.json({
    ok: true,
    token,
    user: { id: userRow.id, email: userRow.email },
    account: { id: accountId, plan: 'pro', billing_status: 'active' },
    widget: widgetRow,
    launch_url: `${baseUrl}/?tqt_token=${encodeURIComponent(token)}&account_id=${encodeURIComponent(accountId)}&source=warren`,
  });
});
