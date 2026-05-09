import { Router } from 'express';
import { query } from '../db/pool.js';
import { getAccountWidgets, getMemberWidget, getSngToken, listApiEvents, listLeads, updateWidgetSettings, upsertConnection } from '../lib/repo.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { decryptJson } from '../lib/crypto.js';
import { sngErrorMessage, sngGet } from '../lib/sng.js';
import { settingsSchema } from '../lib/settings.js';
import { billingLinksFromEnv } from '../lib/plans.js';

export const appRouter = Router();
appRouter.use(requireAuth);

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

appRouter.get('/accounts/:accountId/widgets', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, widgets: await getAccountWidgets(accountId) });
});

appRouter.get('/widgets/:widgetId', async (req: AuthRequest, res) => {
  const widget = await getMemberWidget(req.user!.id, String(req.params.widgetId));
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  return res.json({ ok: true, widget });
});

appRouter.patch('/widgets/:widgetId/settings', async (req: AuthRequest, res) => {
  const widget = await updateWidgetSettings(req.user!.id, String(req.params.widgetId), req.body?.settings || {});
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  return res.json({ ok: true, widget });
});

appRouter.post('/widgets/:widgetId/test-sng', async (req: AuthRequest, res) => {
  const widget = await getMemberWidget(req.user!.id, String(req.params.widgetId));
  if (!widget) return res.status(404).json({ ok: false, error: 'Widget not found.' });
  const settings = widget.settings || {};
  const token = await getSngToken(widget.account_id);
  if (!settings.org_slug || !token) {
    return res.status(400).json({ ok: false, error: 'Missing Sweep&Go organization slug or API token.' });
  }
  try {
    await sngGet(settings, 'api/v2/client_on_boarding/service_registration_form', { organization: settings.org_slug }, token);
    return res.json({ ok: true, message: 'Sweep&Go connection is working.' });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: sngErrorMessage(err, 'Sweep&Go connection test failed.') });
  }
});

appRouter.get('/accounts/:accountId/leads', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, leads: await listLeads(accountId) });
});

appRouter.get('/accounts/:accountId/events', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, events: await listApiEvents(accountId, req.query.widget_id ? String(req.query.widget_id) : undefined) });
});

appRouter.get('/accounts/:accountId/connections', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
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
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  const allowed = ['sng', 'ghl', 'jobber', 'generic', 'email'];
  if (!allowed.includes(kind)) return res.status(400).json({ ok: false, error: 'Unsupported connection.' });
  const row = await upsertConnection(accountId, kind, req.body?.config || {}, req.body?.secret_config || {});
  return res.json({ ok: true, connection: { ...row, secret_config: Object.fromEntries(Object.keys(row.secret_config || {}).map(key => [key, 'configured'])) } });
});
