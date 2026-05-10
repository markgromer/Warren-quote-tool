import { query } from '../db/pool.js';
import { randomBytes } from 'node:crypto';
import { decryptJson, encryptJson } from './crypto.js';
import { mergeSettings, sanitizeSettingsForAccount } from './settings.js';

export type WidgetRecord = {
  id: string;
  account_id: string;
  account_plan?: string;
  billing_status?: string;
  account_addons?: Record<string, any>;
  public_id: string;
  name: string;
  enabled: boolean;
  settings: any;
};

export async function getWidget(publicId: string) {
  const res = await query<WidgetRecord>(
    `SELECT w.*, a.plan AS account_plan, a.billing_status, a.addons AS account_addons
     FROM widgets w
     JOIN accounts a ON a.id = w.account_id
     WHERE w.public_id = $1
     LIMIT 1`,
    [publicId],
  );
  const row = res.rows[0];
  if (!row) return null;
  row.settings = mergeSettings(row.settings);
  return row;
}

export async function getUserAccounts(userId: string) {
  const res = await query(
    `SELECT a.*, am.role
     FROM accounts a
     JOIN account_members am ON am.account_id = a.id
     WHERE am.user_id = $1
     ORDER BY a.created_at ASC`,
    [userId],
  );
  return res.rows;
}

export async function getAccountWidgets(accountId: string) {
  const res = await query<WidgetRecord>(
    `SELECT w.*, a.plan AS account_plan, a.billing_status, a.addons AS account_addons
     FROM widgets w
     JOIN accounts a ON a.id = w.account_id
     WHERE w.account_id = $1
     ORDER BY w.created_at ASC`,
    [accountId],
  );
  return res.rows.map(row => ({ ...row, settings: mergeSettings(row.settings) }));
}

export async function getMemberWidget(userId: string, widgetId: string) {
  const res = await query<WidgetRecord>(
    `SELECT w.*, a.plan AS account_plan, a.billing_status, a.addons AS account_addons
     FROM widgets w
     JOIN accounts a ON a.id = w.account_id
     JOIN account_members am ON am.account_id = w.account_id
     WHERE w.id = $1 AND am.user_id = $2
     LIMIT 1`,
    [widgetId, userId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { ...row, settings: mergeSettings(row.settings) };
}

export async function updateWidgetSettings(userId: string, widgetId: string, settings: any) {
  const widget = await getMemberWidget(userId, widgetId);
  if (!widget) return null;
  const merged = sanitizeSettingsForAccount(settings, {
    plan: widget.account_plan,
    billing_status: widget.billing_status,
    addons: widget.account_addons,
  });
  const res = await query<WidgetRecord>(
    'UPDATE widgets SET settings = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [merged, widgetId],
  );
  return { ...res.rows[0], settings: mergeSettings(res.rows[0].settings) };
}

export async function createDefaultAccount(userId: string, name: string) {
  const account = await query<{ id: string }>('INSERT INTO accounts(name) VALUES($1) RETURNING id', [name || 'My business']);
  const accountId = account.rows[0].id;
  await query('INSERT INTO account_members(account_id, user_id, role) VALUES($1, $2, $3)', [accountId, userId, 'owner']);
  const publicId = `wid_${cryptoRandom()}`;
  await query(
    'INSERT INTO widgets(account_id, public_id, name, settings) VALUES($1, $2, $3, $4)',
    [accountId, publicId, 'Main widget', {}],
  );
  return accountId;
}

export async function logLead(accountId: string, widgetId: string | null, type: string, payload: any, response: any = null) {
  const res = await query<{ id: string }>(
    'INSERT INTO leads(account_id, widget_id, type, payload, response) VALUES($1, $2, $3, $4, $5) RETURNING id',
    [accountId, widgetId, type, payload, response],
  );
  return res.rows[0].id;
}

export async function logApiEvent(accountId: string | null, widgetId: string | null, event: string, payload: any = {}) {
  const res = await query<{ id: string }>(
    'INSERT INTO api_events(account_id, widget_id, event, payload) VALUES($1, $2, $3, $4) RETURNING id',
    [accountId, widgetId, event, payload || {}],
  );
  return res.rows[0].id;
}

export async function updateLeadResponse(id: string, response: any) {
  await query('UPDATE leads SET response = $1, converted = COALESCE(($1->>\'ok\')::boolean, converted) WHERE id = $2', [response, id]);
}

export async function listLeads(accountId: string) {
  const res = await query(
    'SELECT id, type, converted, payload, response, created_at FROM leads WHERE account_id = $1 ORDER BY created_at DESC LIMIT 250',
    [accountId],
  );
  return res.rows;
}

export async function listApiEvents(accountId: string, widgetId?: string) {
  const params: any[] = [accountId];
  let where = 'account_id = $1';
  if (widgetId) {
    params.push(widgetId);
    where += ` AND widget_id = $${params.length}`;
  }
  const res = await query(
    `SELECT id, widget_id, event, payload, created_at
     FROM api_events
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 500`,
    params,
  );
  return res.rows;
}

export async function getConnection(accountId: string, kind: string) {
  const res = await query('SELECT * FROM connections WHERE account_id = $1 AND kind = $2 LIMIT 1', [accountId, kind]);
  const row = res.rows[0];
  if (!row) return null;
  return { ...row, secret_config: decryptJson(row.secret_config, {}) };
}

export async function upsertConnection(accountId: string, kind: string, config: any, secretConfig: any) {
  const existing = await getConnection(accountId, kind);
  const cleanedSecrets = Object.fromEntries(
    Object.entries(secretConfig || {}).filter(([, value]) => String(value ?? '').trim() !== ''),
  );
  const mergedSecrets = { ...(existing?.secret_config || {}), ...cleanedSecrets };
  const encrypted = encryptJson(mergedSecrets);
  const res = await query(
    `INSERT INTO connections(account_id, kind, config, secret_config)
     VALUES($1, $2, $3, $4)
     ON CONFLICT(account_id, kind)
     DO UPDATE SET config = EXCLUDED.config, secret_config = EXCLUDED.secret_config, updated_at = now()
     RETURNING *`,
    [accountId, kind, config || {}, encrypted],
  );
  return { ...res.rows[0], secret_config: decryptJson(res.rows[0].secret_config, {}) };
}

export async function getSngToken(accountId: string) {
  const conn = await getConnection(accountId, 'sng');
  return String(conn?.secret_config?.api_token || '');
}

export async function getOpenPhoneApiKey(accountId: string) {
  const conn = await getConnection(accountId, 'openphone');
  return String(conn?.secret_config?.api_key || '');
}

function cryptoRandom() {
  return randomBytes(12).toString('hex');
}
