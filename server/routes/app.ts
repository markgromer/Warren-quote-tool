import { Router } from 'express';
import { query } from '../db/pool.js';
import { getAccountWidgets, getMemberWidget, listLeads, updateWidgetSettings, upsertConnection } from '../lib/repo.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { decryptJson } from '../lib/crypto.js';

export const appRouter = Router();
appRouter.use(requireAuth);

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

appRouter.get('/accounts/:accountId/leads', async (req: AuthRequest, res) => {
  const accountId = String(req.params.accountId);
  const member = await query('SELECT 1 FROM account_members WHERE account_id = $1 AND user_id = $2', [accountId, req.user!.id]);
  if (!member.rowCount) return res.status(404).json({ ok: false, error: 'Account not found.' });
  return res.json({ ok: true, leads: await listLeads(accountId) });
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
  const allowed = ['sng', 'ghl', 'jobber', 'email'];
  if (!allowed.includes(kind)) return res.status(400).json({ ok: false, error: 'Unsupported connection.' });
  const row = await upsertConnection(accountId, kind, req.body?.config || {}, req.body?.secret_config || {});
  return res.json({ ok: true, connection: { ...row, secret_config: Object.fromEntries(Object.keys(row.secret_config || {}).map(key => [key, 'configured'])) } });
});
