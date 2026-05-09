import { normFreq, freqLabel } from './quote.js';

export function authHeader(token: string) {
  const clean = token.trim();
  if (!clean) return '';
  // Allow raw tokens as well as full Authorization header values such as
  // "Bearer ...", "Token ...", or "Basic ...".
  return /^[A-Za-z][A-Za-z0-9+.-]*\s+\S/.test(clean) ? clean : `Bearer ${clean}`;
}

export function sngErrorMessage(err: any, fallback = 'Could not reach Sweep&Go.') {
  const status = Number(err?.status || err?.data?.status || 0) || null;
  const message = String(err?.message || err?.data?.message || err?.data?.error || '').trim();
  if (status === 401 || /unauthorized/i.test(message)) {
    return 'Sweep&Go rejected the API token (401 Unauthorized). Re-save the Sweep&Go secret for this account and confirm the org slug/base URL match that token.';
  }
  if (status === 403 || /forbidden/i.test(message)) {
    return 'Sweep&Go rejected access for this token (403 Forbidden). Confirm the token has access to this organization.';
  }
  return message || fallback;
}

export async function sngGet(settings: any, path: string, params: Record<string, any>, token: string) {
  const base = String(settings.base_url || 'https://openapi.sweepandgo.com').replace(/\/+$/, '');
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const res = await fetch(`${base}/${path.replace(/^\/+/, '')}?${qs}`, {
    headers: { Authorization: authHeader(token), Accept: 'application/json' },
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err: any = new Error(data?.message || data?.error || text || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function sngPost(settings: any, path: string, payload: Record<string, any>, token: string) {
  const base = String(settings.base_url || 'https://openapi.sweepandgo.com').replace(/\/+$/, '');
  const res = await fetch(`${base}/${path.replace(/^\/+/, '')}`, {
    method: 'POST',
    headers: { Authorization: authHeader(token), Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err: any = new Error(data?.message || data?.error || text || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function sngContext(settings: any, body: any = {}) {
  const organization = body.organization || settings.org_slug || '';
  const location_id = body.location_id || settings.location_id || '';
  const organization_form_id = body.organization_form_id || body.form_id || settings.organization_form_id || '';
  return { organization, location_id, organization_form_id };
}

export function buildSngPriceParams(settings: any, body: any) {
  let frequency = normFreq(body.clean_up_frequency ?? body.frequency ?? 'once_a_week');
  if (settings.recurring_calc_mode === 'four_weeks' && frequency === 'once_a_month') frequency = 'every_four_weeks';
  const ctx = sngContext(settings, body);
  return {
    ...ctx,
    zip_code: String(body.zip_code ?? body.zip ?? '').replace(/\D/g, '').slice(0, 5),
    number_of_dogs: Math.max(1, Number(body.number_of_dogs ?? body.dogs ?? 1) || 1),
    clean_up_frequency: freqLabel(frequency),
    last_time_yard_was_thoroughly_cleaned: body.last_time_yard_was_thoroughly_cleaned || 'one_week',
    tqt_clean_up_frequency_slug_used: frequency,
  };
}
