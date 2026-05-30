import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { getAccountWidgets, getSngToken, listApiEvents, listLeads, upsertConnection } from '../lib/repo.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { isAdminUser, requireAdmin } from '../middleware/admin.js';
import { decryptJson } from '../lib/crypto.js';
import { buildSngPriceParams, sngErrorMessage, sngGet, sngOptionsFromFormFields } from '../lib/sng.js';
import { manualDogOptions, manualFrequencyOptions, numberValue } from '../lib/quote.js';
import { mergeSettings, sanitizeSettingsForAccount, settingsSchema } from '../lib/settings.js';
import { billingLinksFromEnv } from '../lib/plans.js';
import { sendPasswordResetEmail } from './auth.js';
import { sendMail } from '../lib/mail.js';

export const appRouter = Router();
appRouter.use(requireAuth);

function hasNumericPrice(data: any) {
  const queue = [data];
  const seen = new Set<any>();
  const keys = new Set(['price_per_cleanup', 'pricePerCleanup', 'per_cleanup', 'perCleanup', 'monthly_price', 'monthlyPrice', 'monthly_total', 'monthlyTotal', 'value']);
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (keys.has(key) && numberValue(value) != null) return true;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

async function canAccessAccount(req: AuthRequest, accountId: string) {
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (member.rowCount) return true;
  return isAdminUser(req.user!);
}

async function getAccessibleWidget(req: AuthRequest, widgetId: string) {
  const found = await query<any>(
    `SELECT w.*, a.plan AS account_plan, a.billing_status, a.addons AS account_addons
     FROM widgets w
     JOIN accounts a ON a.id = w.account_id
     WHERE w.id = $1
     LIMIT 1`,
    [widgetId],
  );
  const widget = found.rows[0];
  if (!widget || !(await canAccessAccount(req, widget.account_id))) return null;
  return { ...widget, settings: mergeSettings(widget.settings) };
}

appRouter.get('/settings-schema', async (_req: AuthRequest, res) => {
  return res.json({ ok: true, schema: settingsSchema() });
});

appRouter.get('/billing-links', async (_req: AuthRequest, res) => {
  return res.json({
    ok: true,
    links: billingLinksFromEnv(),
  });
});

appRouter.get('/admin/accounts', requireAdmin, async (_req: AuthRequest, res) => {
  const rows = await query(
    `SELECT
       a.id,
       a.name,
       a.plan,
       a.billing_status,
       a.addons,
       a.stripe_customer_id,
       a.stripe_subscription_id,
       a.created_at,
       a.updated_at,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'email', u.email, 'role', am.role)) FILTER (WHERE u.id IS NOT NULL), '[]') AS members,
       COALESCE(json_agg(DISTINCT jsonb_build_object('id', w.id, 'public_id', w.public_id, 'name', w.name, 'enabled', w.enabled)) FILTER (WHERE w.id IS NOT NULL), '[]') AS widgets,
       COUNT(DISTINCT l.id)::int AS lead_count
     FROM accounts a
     LEFT JOIN account_members am ON am.account_id = a.id
     LEFT JOIN users u ON u.id = am.user_id
     LEFT JOIN widgets w ON w.account_id = a.id
     LEFT JOIN leads l ON l.account_id = a.id
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
  );
  return res.json({ ok: true, accounts: rows.rows });
});

appRouter.patch('/admin/accounts/:accountId', requireAdmin, async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const plan = String(req.body?.plan || '').toLowerCase();
  const billingStatus = String(req.body?.billing_status || '').toLowerCase();
  const allowedPlans = ['free', 'starter', 'pro', 'agency'];
  const allowedStatuses = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];
  if (plan && !allowedPlans.includes(plan)) return res.status(400).json({ ok: false, error: 'Unsupported plan.' });
  if (billingStatus && !allowedStatuses.includes(billingStatus)) return res.status(400).json({ ok: false, error: 'Unsupported billing status.' });
  const addons = req.body?.addons && typeof req.body.addons === 'object' ? req.body.addons : null;
  const stripeCustomerId = req.body?.stripe_customer_id != null ? String(req.body.stripe_customer_id) : null;
  const stripeSubscriptionId = req.body?.stripe_subscription_id != null ? String(req.body.stripe_subscription_id) : null;

  const sets: string[] = [];
  const params: any[] = [];
  const addSet = (sql: string, value: any) => {
    params.push(value);
    sets.push(`${sql} = $${params.length}`);
  };
  if (plan) addSet('plan', plan);
  if (billingStatus) addSet('billing_status', billingStatus);
  if (addons) addSet('addons', addons);
  if (stripeCustomerId !== null) addSet('stripe_customer_id', stripeCustomerId);
  if (stripeSubscriptionId !== null) addSet('stripe_subscription_id', stripeSubscriptionId);
  if (!sets.length) return res.status(400).json({ ok: false, error: 'No admin changes supplied.' });
  params.push(accountId);
  const row = await query(
    `UPDATE accounts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!row.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, account: row.rows[0] });
});

appRouter.post('/admin/smtp-test', requireAdmin, async (req: AuthRequest, res) => {
  const to = String(req.body?.to || req.user?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid test email address.' });
  }

  try {
    const result: any = await sendMail(
      to,
      'WARREN Quote Tool email test',
      `This is a test email from WARREN Quote Tool.\n\nIf you received this, email delivery is configured for notifications and password resets.\n\nSent at: ${new Date().toISOString()}`,
    );
    if (result?.skipped) {
      return res.status(500).json({ ok: false, error: 'No email provider is configured, so no email was sent. Set RESEND_API_KEY or SMTP_HOST.' });
    }
    const messageId = result?.messageId ? String(result.messageId) : '';
    const provider = result?.provider ? String(result.provider) : 'smtp';
    return res.json({
      ok: true,
      email: to,
      message_id: messageId,
      message: messageId
        ? `Email test sent to ${to} via ${provider}. Provider accepted message ${messageId}.`
        : `Email test sent to ${to} via ${provider}.`,
    });
  } catch (err: any) {
    console.error('Email test failed', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Email test failed.' });
  }
});

appRouter.post('/admin/users/:userId/password-reset', requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params.userId);
  const found = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [userId]);
  const user = found.rows[0];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  try {
    const result: any = await sendPasswordResetEmail(req, user);
    if (result?.skipped) {
      return res.status(500).json({ ok: false, error: 'Reset token created, but no email provider is configured so no email was sent.' });
    }
    const messageId = result?.messageId ? String(result.messageId) : '';
    return res.json({
      ok: true,
      email: user.email,
      message_id: messageId,
      message: messageId
        ? `Password reset email sent to ${user.email}. Provider accepted message ${messageId}.`
        : `Password reset email sent to ${user.email}.`,
    });
  } catch (err) {
    console.error('Admin password reset email failed', err);
    return res.status(500).json({ ok: false, error: 'Could not send password reset email.' });
  }
});

appRouter.post('/admin/users/:userId/password', requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params.userId);
  const password = String(req.body?.password || '');
  if (password.length < 8) return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.' });

  const found = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [userId]);
  const user = found.rows[0];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  const hash = await bcrypt.hash(password, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, user.id]);
  return res.json({ ok: true, email: user.email, message: `Password updated for ${user.email}.` });
});

appRouter.delete('/admin/accounts/:accountId/members/:userId', requireAdmin, async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const userId = String(req.params.userId);
  const found = await query<{ email: string }>(
    `SELECT u.email
     FROM account_members am
     JOIN users u ON u.id = am.user_id
     WHERE am.account_id = $1 AND am.user_id = $2
     LIMIT 1`,
    [accountId, userId],
  );
  const member = found.rows[0];
  if (!member) return res.status(404).json({ ok: false, error: 'Member not found on this account.' });

  await query('DELETE FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, userId]);
  return res.json({ ok: true, message: `${member.email} was removed from this brand.` });
});

appRouter.delete('/admin/users/:userId', requireAdmin, async (req: AuthRequest, res) => {
  const userId = String(req.params.userId);
  if (userId === req.user!.id) return res.status(400).json({ ok: false, error: 'You cannot delete your own admin user.' });
  const found = await query<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = $1 LIMIT 1', [userId]);
  const user = found.rows[0];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });

  await query('DELETE FROM users WHERE id = $1', [userId]);
  return res.json({ ok: true, message: `${user.email} was deleted.` });
});

appRouter.get('/accounts/:accountId/widgets', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  if (!(await canAccessAccount(req, accountId))) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, widgets: await getAccountWidgets(accountId) });
});

appRouter.get('/widgets/:widgetId', async (req: AuthRequest, res) => {
  const widget = await getAccessibleWidget(req, String(req.params.widgetId));
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  return res.json({ ok: true, widget });
});

appRouter.patch('/widgets/:widgetId/settings', async (req: AuthRequest, res) => {
  const existing = await getAccessibleWidget(req, String(req.params.widgetId));
  if (!existing) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  const settings = sanitizeSettingsForAccount(req.body?.settings || {}, {
    plan: existing.account_plan,
    billing_status: existing.billing_status,
    addons: existing.account_addons,
  });
  const updated = await query<any>('UPDATE widgets SET settings = $1, updated_at = now() WHERE id = $2 RETURNING *', [settings, existing.id]);
  const widget = { ...updated.rows[0], settings: mergeSettings(updated.rows[0].settings) };
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  return res.json({ ok: true, widget });
});

appRouter.post('/widgets/:widgetId/test-sng', async (req: AuthRequest, res) => {
  const widget = await getAccessibleWidget(req, String(req.params.widgetId));
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  const settings = widget.settings || {};
  const token = await getSngToken(widget.account_id);
  if (!settings.org_slug || !token) {
    return res.status(400).json({ ok: false, error: 'Missing Sweep&Go organization slug or API token.' });
  }
  try {
    const form = await sngGet(settings, 'api/v2/client_on_boarding/service_registration_form', { organization: settings.org_slug }, token);
    const formOptions = sngOptionsFromFormFields(form);
    const testZip = String(settings.sng_test_zip || '').replace(/\D/g, '').slice(0, 5);
    if (!testZip) {
      return res.json({
        ok: true,
        message: 'Sweep&Go token and form access work. Add a Sweep&Go test ZIP to verify pricing too.',
      });
    }

    const dogs = settings.quote_input_mode === 'service_plans'
      ? 1
      : (manualDogOptions(settings)[0] || formOptions.dogs[0] || 1);
    const frequency = (manualFrequencyOptions(settings)[0]?.value || formOptions.frequencies_meta[0]?.value || 'once_a_week');
    const params = buildSngPriceParams(settings, {
      organization: settings.org_slug,
      zip_code: testZip,
      number_of_dogs: dogs,
      clean_up_frequency: frequency,
      last_time_yard_was_thoroughly_cleaned: 'one_week',
    }, 'label');
    delete (params as any).tqt_clean_up_frequency_slug_used;
    if (!params.organization_form_id && formOptions.organization_form_id) {
      params.organization_form_id = String(formOptions.organization_form_id);
    }
    const price = await sngGet(settings, 'api/v2/client_on_boarding/price_registration_form', params, token);
    if (!hasNumericPrice(price)) {
      return res.status(400).json({
        ok: false,
        error: 'Sweep&Go token and form access work, but the test ZIP did not return a numeric price. Check the test ZIP, dog/frequency options, location ID, and organization form ID.',
      });
    }
    return res.json({ ok: true, message: 'Sweep&Go token, form access, and test pricing are working.' });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: sngErrorMessage(err, 'Sweep&Go connection test failed.') });
  }
});

appRouter.get('/accounts/:accountId/leads', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  if (!(await canAccessAccount(req, accountId))) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, leads: await listLeads(accountId) });
});

appRouter.get('/accounts/:accountId/events', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  if (!(await canAccessAccount(req, accountId))) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, events: await listApiEvents(accountId, req.query.widget_id ? String(req.query.widget_id) : undefined) });
});

appRouter.get('/accounts/:accountId/connections', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  if (!(await canAccessAccount(req, accountId))) return res.status(404).json({ ok: false, error: 'Account not found.' });
  const rows = await query('SELECT id, kind, label, config, secret_config, updated_at FROM connections WHERE account_id = $1 ORDER BY kind', [accountId]);
  return res.json({
    ok: true,
    connections: rows.rows.map(row => ({
      ...row,
      secret_config: Object.fromEntries(Object.keys(decryptJson(row.secret_config, {})).map(key => [key, 'configured'])),
    })),
  });
});

appRouter.put('/accounts/:accountId/connections/:kind', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const kind = String(req.params.kind);
  if (!(await canAccessAccount(req, accountId))) return res.status(404).json({ ok: false, error: 'Account not found.' });
  const allowed = ['sng', 'ghl', 'jobber', 'generic', 'email', 'openphone'];
  if (!allowed.includes(kind)) return res.status(400).json({ ok: false, error: 'Unsupported connection.' });
  const row = await upsertConnection(accountId, kind, req.body?.config || {}, req.body?.secret_config || {});
  return res.json({ ok: true, connection: { ...row, secret_config: Object.fromEntries(Object.keys(row.secret_config || {}).map(key => [key, 'configured'])) } });
});
