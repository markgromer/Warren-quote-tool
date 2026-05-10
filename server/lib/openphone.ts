import { freqLabel } from './quote.js';

export function openPhoneReady(settings: any, apiKey: string) {
  if (!settings?.openphone_enabled) return false;
  if (!String(apiKey || '').trim()) return false;
  return !!(String(settings.openphone_from_number || '').trim() || String(settings.openphone_phone_number_id || '').trim());
}

export function e164Phone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
  return ten.length === 10 ? `+1${ten}` : '';
}

export function renderSmsTemplate(template: string, payload: any) {
  const data: Record<string, string | number> = smsTemplateData(payload || {});
  return String(template || '')
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => String(data[key] ?? ''))
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, 1200);
}

function smsTemplateData(payload: any) {
  const dogs = Math.max(1, Number(payload.number_of_dogs ?? payload.dogs ?? 1) || 1);
  const frequency = String(payload.clean_up_frequency || payload.frequency || '').trim();
  const perCleanup = money(payload.per_cleanup ?? payload.price_per_cleanup);
  const monthly = money(payload.monthly_price);
  const firstName = String(payload.first_name || '').trim();
  return {
    first_name: firstName,
    name: firstName || String(payload.name || '').trim(),
    zip: String(payload.zip_code || payload.zip || '').trim(),
    dogs,
    dog_label: `${dogs} ${dogs === 1 ? 'dog' : 'dogs'}`,
    frequency,
    frequency_label: frequency ? freqLabel(frequency) : '',
    per_cleanup: perCleanup,
    monthly,
    yard_sqft: payload.yard_sqft ? String(payload.yard_sqft) : '',
  };
}

function money(value: unknown) {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : '';
}

export async function sendOpenPhoneSms(settings: any, apiKey: string, toPhone: unknown, content: string) {
  const to = e164Phone(toPhone);
  if (!to) return { ok: true, skipped: true, reason: 'missing_to_phone' };
  if (!openPhoneReady(settings, apiKey)) return { ok: true, skipped: true, reason: 'not_configured' };
  const body: Record<string, any> = {
    content,
    to: [to],
  };
  const from = e164Phone(settings.openphone_from_number);
  if (from) body.from = from;
  const phoneNumberId = String(settings.openphone_phone_number_id || '').trim();
  if (phoneNumberId) body.phoneNumberId = phoneNumberId;
  const userId = String(settings.openphone_user_id || '').trim();
  if (userId) body.userId = userId;
  const inboxStatus = String(settings.openphone_set_inbox_status || '').trim();
  if (inboxStatus) body.setInboxStatus = inboxStatus;

  const res = await fetch('https://api.openphone.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: String(apiKey).trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err: any = new Error(data?.message || data?.error || text || `OpenPhone HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { ok: true, status: res.status, data };
}
