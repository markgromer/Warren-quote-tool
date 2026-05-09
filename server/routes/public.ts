import { Router } from 'express';
import crypto from 'node:crypto';
import { getSngToken, getWidget, logApiEvent, logLead, updateLeadResponse } from '../lib/repo.js';
import { computeManualPrice, digits, freqLabel, localAreaOptions, manualDogOptions, manualFrequencyOptions, normalizeQuotePrice, normalizeYardSqft, numberValue, publicWidgetConfig, yardBucket } from '../lib/quote.js';
import { copyStrings, sanitizeSettingsForAccount } from '../lib/settings.js';
import { buildSngPriceParams, sngAuthStatus, sngContext, sngErrorMessage, sngGet, sngOptionsFromFormFields, sngPost, sngPut } from '../lib/sng.js';
import { sendMail } from '../lib/mail.js';

export const publicRouter = Router();

async function load(req: any, res: any) {
  const widget = await getWidget(req.params.widgetId);
  if (!widget || !widget.enabled) {
    res.status(404).json({ ok: false, error: 'Widget not found.' });
    return null;
  }
  const token = await getSngToken(widget.account_id);
  const settings = sanitizeSettingsForAccount(widget.settings, {
    plan: widget.account_plan,
    billing_status: widget.billing_status,
    addons: widget.account_addons,
  });
  return { widget, settings, token };
}

async function safeUpdateLeadResponse(id: string | null, response: any) {
  if (!id) return;
  try {
    await updateLeadResponse(id, response);
  } catch {
    // Logging must never turn a public quote request into a gateway error.
  }
}

function sngExplicitOutOfArea(data: any) {
  if (!data) return false;
  if (data.waitlist === true || data.out_of_area === true || data.outOfArea === true || data.available === false) return true;
  const code = String(data.code || data.status || '').toLowerCase();
  if (/out[_-]?of[_-]?area|not[_-]?served|unavailable|no[_-]?options/.test(code)) return true;
  const error = String(data.error || data.message || '').toLowerCase();
  if (error === 'error') return true;
  return /out of (our|the) area|not in (our|the) area|not served|no service|unavailable/.test(error);
}

function sngHasNumericPrice(data: any) {
  const queue = [data];
  const seen = new Set<any>();
  const priceKeys = new Set([
    'price_per_cleanup',
    'pricePerCleanup',
    'per_cleanup',
    'perCleanup',
    'price_per_service',
    'pricePerService',
    'price_per_visit',
    'pricePerVisit',
    'display_price',
    'displayPrice',
    'monthly_price',
    'monthlyPrice',
    'monthly_total',
    'monthlyTotal',
    'monthly_amount',
    'monthlyAmount',
    'price_per_month',
    'pricePerMonth',
    'value',
  ]);
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (priceKeys.has(key) && numberValue(value) != null) return true;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return false;
}

function normalizeSngPrice(data: any) {
  if (!data || !data.price || typeof data.price !== 'object') return data;
  const value = numberValue(data.price.value);
  if (value == null) return data;
  if (numberValue(data.price.price_per_cleanup) != null || numberValue(data.price.monthly_price) != null) return data;

  const billingInterval = String(data.price.billing_interval || data.price.billingInterval || '').toLowerCase();
  const category = String(data.price.category || '').toLowerCase();
  data.price = {
    ...data.price,
    price_per_cleanup: (billingInterval && billingInterval !== 'per_cleanup' && billingInterval !== 'per_cleaning') || category === 'prepaid' ? null : value,
    monthly_price: billingInterval === 'monthly' || category === 'prepaid' ? value : null,
  };
  return data;
}

async function discoverSngFormId(settings: any, token: string, organization: string) {
  const meta = await sngGet(settings, 'api/v2/client_on_boarding/service_registration_form', { organization }, token);
  return { meta, formOptions: sngOptionsFromFormFields(meta) };
}

publicRouter.get('/widgets/:widgetId/config', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.settings.developer_events_enabled) {
    await logApiEvent(ctx.widget.account_id, ctx.widget.id, 'widget_config_loaded', {
      referer: req.get('referer') || '',
      user_agent: req.get('user-agent') || '',
    });
  }
  res.json({ ok: true, ...publicWidgetConfig(ctx.widget, ctx.settings) });
});

publicRouter.post('/widgets/:widgetId/event', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (!ctx.settings.developer_events_enabled) return res.json({ ok: true, skipped: true });
  const event = String(req.body?.event || '').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);
  if (!event) return res.status(400).json({ ok: false, error: 'Event name is required.' });
  if (!ctx.settings.debug_events_enabled && /^debug[_.:-]/i.test(event)) return res.json({ ok: true, skipped: true });
  const detail = req.body?.detail && typeof req.body.detail === 'object' ? req.body.detail : {};
  const scrubbed = { ...detail };
  for (const key of ['email', 'phone', 'lead_phone', 'street', 'first_name', 'last_name']) delete scrubbed[key];
  const id = await logApiEvent(ctx.widget.account_id, ctx.widget.id, event, {
    detail: scrubbed,
    page: String(req.body?.page || '').slice(0, 500),
    referer: req.get('referer') || '',
    user_agent: req.get('user-agent') || '',
  });
  res.json({ ok: true, event_id: id });
});

publicRouter.get('/widgets/:widgetId/options', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const { widget, settings, token } = ctx;
  if (settings.service_data_source === 'local') {
    return res.json({
      ok: true,
      dogs: manualDogOptions(settings),
      frequencies_meta: manualFrequencyOptions(settings),
      area_options: localAreaOptions(settings),
      local_data: true,
    });
  }
  if (!token || !settings.org_slug) return res.status(400).json({ ok: false, error: 'Missing Sweep&Go organization or API token.' });
  try {
    const zip = digits(req.query.zip, 5);
    const organization = String(req.query.org || settings.org_slug || '').trim();
    const { meta: data, formOptions } = await discoverSngFormId(settings, token, organization);
    const dogs = Array.isArray(data?.dogs) && data.dogs.length
      ? data.dogs
      : Array.isArray(data?.number_of_dogs) && data.number_of_dogs.length
        ? data.number_of_dogs
        : formOptions.dogs.length
          ? formOptions.dogs
          : manualDogOptions(settings);
    const frequencies_meta = Array.isArray(data?.frequencies_meta) && data.frequencies_meta.length
      ? data.frequencies_meta
      : Array.isArray(data?.frequencies) && data.frequencies.length
        ? data.frequencies.map((f: string) => ({ value: f, label: freqLabel(f) }))
        : formOptions.frequencies_meta.length
          ? formOptions.frequencies_meta
          : manualFrequencyOptions(settings);
    if (zip.length === 5 && dogs.length && frequencies_meta.length) {
      const probeParams = buildSngPriceParams(settings, {
        organization,
        zip_code: zip,
        number_of_dogs: dogs[0],
        clean_up_frequency: frequencies_meta[0].value,
        last_time_yard_was_thoroughly_cleaned: 'one_week',
      });
      delete (probeParams as any).tqt_clean_up_frequency_slug_used;
      const probe = await sngGet(settings, 'api/v2/client_on_boarding/price_registration_form', probeParams, token);
      if (sngExplicitOutOfArea(probe)) {
        const copy = copyStrings(settings);
        const response = { ok: false, waitlist: true, out_of_area: true, code: 'tqt_out_of_area', error: copy.waitlistText || 'Oh no, we are not in your area yet.' };
        await logLead(widget.account_id, widget.id, 'options', { query: req.query, probe: probeParams }, response);
        return res.status(200).json(response);
      }
    }
    await logLead(widget.account_id, widget.id, 'options', { query: req.query }, { ok: true });
    res.json({ ok: true, dogs, frequencies_meta, last_times: formOptions.last_times, organization_form_id: formOptions.organization_form_id, raw: data });
  } catch (err: any) {
    const error = sngErrorMessage(err, 'Could not load options from Sweep&Go.');
    await logLead(widget.account_id, widget.id, 'options_error', { query: req.query }, { ok: false, error, upstream_status: err?.status || null });
    res.status(200).json({ ok: false, error, code: sngAuthStatus(err) === 401 ? 'tqt_sng_unauthorized' : 'tqt_options_error' });
  }
});

publicRouter.get('/widgets/:widgetId/addons', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const { settings, token } = ctx;
  if (settings.service_data_source === 'local') return res.json({ ok: true, addons: [] });
  if (!token || !settings.org_slug) return res.json({ ok: true, addons: [] });
  try {
    const data = await sngGet(settings, 'api/v2/client_on_boarding/service_registration_form', { organization: req.query.org || settings.org_slug }, token);
    const addons = data?.cross_sells || data?.addons || data?.services || [];
    res.json({ ok: true, addons: Array.isArray(addons) ? addons : [] });
  } catch {
    res.json({ ok: true, addons: [] });
  }
});

publicRouter.post('/widgets/:widgetId/local_price', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const computed = computeManualPrice(ctx.settings, req.body || {});
  const entryId = await logLead(ctx.widget.account_id, ctx.widget.id, 'quote', { request: req.body, local_price_route: true }, computed || null);
  if (!computed) {
    const response = { ok: false, error: 'Manual pricing is required. Add a manual price row for this dog/frequency combination.', code: 'tqt_manual_required' };
    await updateLeadResponse(entryId, response);
    return res.status(200).json(response);
  }
  await updateLeadResponse(entryId, computed);
  res.json(computed);
});

publicRouter.post('/widgets/:widgetId/price', async (req, res) => {
  let entryId: string | null = null;
  try {
    const ctx = await load(req, res);
    if (!ctx) return;
    const { widget, settings, token } = ctx;
    const body = req.body || {};
    const manual = computeManualPrice(settings, body);
    try {
      entryId = await logLead(widget.account_id, widget.id, 'quote', { request: body }, null);
    } catch {
      entryId = null;
    }
    if (manual) {
      await safeUpdateLeadResponse(entryId, manual);
      return res.json(manual);
    }
    if (settings.service_data_source === 'local') {
      const response = { ok: false, error: 'Manual pricing is required when using local data mode.', code: 'tqt_manual_required' };
      await safeUpdateLeadResponse(entryId, response);
      return res.status(200).json(response);
    }
    if (!token || !settings.org_slug) {
      const response = { ok: false, error: 'Missing Sweep&Go organization or API token.', code: 'tqt_missing_sng' };
      await safeUpdateLeadResponse(entryId, response);
      return res.status(200).json(response);
    }
    const params = buildSngPriceParams(settings, req.body || {}, 'slug');
    const slug = params.tqt_clean_up_frequency_slug_used;
    delete (params as any).tqt_clean_up_frequency_slug_used;
    let data = normalizeSngPrice(await sngGet(settings, 'api/v2/client_on_boarding/price_registration_form', params, token));
    if (!sngExplicitOutOfArea(data) && !sngHasNumericPrice(data)) {
      const labelParams = buildSngPriceParams(settings, req.body || {}, 'label');
      delete (labelParams as any).tqt_clean_up_frequency_slug_used;
      const labelData = normalizeSngPrice(await sngGet(settings, 'api/v2/client_on_boarding/price_registration_form', labelParams, token));
      if (sngExplicitOutOfArea(labelData) || sngHasNumericPrice(labelData)) data = labelData;
    }
    if (sngExplicitOutOfArea(data)) {
      const copy = copyStrings(settings);
      const response = { ok: false, waitlist: true, out_of_area: true, code: 'tqt_out_of_area', error: copy.waitlistText || 'Oh no, we are not in your area yet.', tqt_clean_up_frequency_slug_used: slug };
      await safeUpdateLeadResponse(entryId, response);
      return res.status(200).json(response);
    }
    if (!sngHasNumericPrice(data)) {
      const response = {
        ok: false,
        code: 'tqt_sng_no_price',
        error: 'Sweep&Go verified this ZIP, but did not return a numeric price for this dog/frequency selection.',
        tqt_clean_up_frequency_slug_used: slug,
        sng_price_response: data,
      };
      await safeUpdateLeadResponse(entryId, response);
      return res.status(200).json(response);
    }
    const response = normalizeQuotePrice(settings, { ...data, tqt_clean_up_frequency_slug_used: slug }, slug, req.body?.yard_sqft);
    await safeUpdateLeadResponse(entryId, response);
    res.json(response);
  } catch (err: any) {
    const error = sngErrorMessage(err, 'Could not fetch price from Sweep&Go.');
    const response = { ok: false, error, code: sngAuthStatus(err) === 401 ? 'tqt_sng_unauthorized' : 'tqt_price_error' };
    await safeUpdateLeadResponse(entryId, response);
    res.status(200).json(response);
  }
});

publicRouter.post('/widgets/:widgetId/coupon_validate', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.settings.service_data_source === 'local') return res.status(400).json({ ok: false, error: 'Coupons are only available with Sweep&Go data.' });
  if (!ctx.token) return res.status(400).json({ ok: false, error: 'Missing Sweep&Go API token.' });
  const coupon_id = String(req.body?.coupon_id || '').trim();
  if (!coupon_id) return res.status(400).json({ ok: false, error: 'Missing coupon code.' });
  try {
    const data = await sngGet(ctx.settings, 'api/v2/client_on_boarding/coupon_find', { coupon_id, ...sngContext(ctx.settings, req.body) }, ctx.token);
    if (!data?.coupon) return res.status(400).json({ ok: false, error: 'Coupon not valid for this organization.' });
    res.json({ ok: true, coupon: data.coupon });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message || 'Coupon not valid.' });
  }
});

publicRouter.post('/widgets/:widgetId/coupon_help', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const zip = digits(req.body?.zip || req.body?.zip_code, 5);
  const phone = digits(req.body?.phone, 11).replace(/^1(\d{10})$/, '$1');
  if (!zip) return res.status(400).json({ ok: false, error: 'ZIP code is required.' });
  if (phone.length !== 10) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit phone number.' });
  const id = await logLead(ctx.widget.account_id, ctx.widget.id, 'coupon_help', { zip, phone, organization: ctx.settings.org_slug }, { ok: true });
  await sendMail(ctx.settings.email_to, 'Coupon help request', `ZIP: ${zip}\nPhone: ${phone}\nOrganization: ${ctx.settings.org_slug}`);
  res.json({ ok: true, entry_id: id });
});

publicRouter.post('/widgets/:widgetId/quote_lead', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const phone = digits(req.body?.phone, 11).replace(/^1(\d{10})$/, '$1');
  if (!phone) return res.status(400).json({ ok: false, error: 'Phone number is required.' });
  const payload = { ...req.body, phone };
  const id = await logLead(ctx.widget.account_id, ctx.widget.id, 'partial_quote', payload, { ok: true });
  if (ctx.settings.enable_partial_lead_email) {
    await sendMail(ctx.settings.email_to, 'TitanQuoteTool: New Lead (Price Viewed)', JSON.stringify(payload, null, 2));
  }
  await deliverWebhook(ctx.settings, 'partial_quote', payload, id);
  res.json({ ok: true, entry_id: id });
});

publicRouter.post('/widgets/:widgetId/waitlist', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  if (ctx.settings.service_data_source === 'local') return res.status(400).json({ ok: false, error: 'Waitlist requests are unavailable when using local data.' });
  const zip = digits(req.body?.zip || req.body?.zip_code, 5);
  const email = String(req.body?.email || '').trim();
  if (!zip) return res.status(400).json({ ok: false, error: 'ZIP code is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Valid email is required.' });
  const id = await logLead(ctx.widget.account_id, ctx.widget.id, 'waitlist', { zip, email, organization: ctx.settings.org_slug }, { ok: true });
  await sendMail(ctx.settings.email_to, 'New waitlist request', `ZIP: ${zip}\nEmail: ${email}\nOrganization: ${ctx.settings.org_slug}`);
  res.json({ ok: true, entry_id: id });
});

publicRouter.post('/widgets/:widgetId/onboard', async (req, res) => {
  const ctx = await load(req, res);
  if (!ctx) return;
  const { settings, token, widget } = ctx;
  const body = req.body || {};
  const phoneDigits = digits(body.phone, 11).replace(/^1(\d{10})$/, '$1');
  const zip = digits(body.zip || body.zip_code, 5);
  const firstName = String(body.first_name || '').trim();
  const lastName = String(body.last_name || '').trim();
  const email = String(body.email || '').trim();
  const street = String(body.street || body.home_address || '').trim();
  const city = String(body.city || '').trim();
  const stateName = String(body.state || '').trim();
  if (!zip) return res.status(400).json({ ok: false, error: 'ZIP code is required.' });
  if (!firstName || !lastName) return res.status(400).json({ ok: false, error: 'First and last name are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Valid email is required.' });
  if (phoneDigits.length !== 10) return res.status(400).json({ ok: false, error: 'Valid 10-digit phone number is required.' });
  if (!street || !city || !stateName) return res.status(400).json({ ok: false, error: 'Street, city, and state are required.' });
  const payload: any = {
    organization: body.organization || settings.org_slug || 'local',
    zip_code: zip,
    number_of_dogs: Math.max(1, Number(body.dogs || body.number_of_dogs || 1) || 1),
    clean_up_frequency: body.frequency || body.clean_up_frequency || 'once_a_week',
    price_per_cleanup: body.per_cleanup ?? body.price_per_cleanup ?? null,
    monthly_price: body.monthly_price ?? null,
    first_name: firstName,
    last_name: lastName,
    email,
    cell_phone_number: phoneDigits,
    home_phone_number: phoneDigits,
    phone: phoneDigits,
    home_address: street,
    city,
    state: stateName,
    last_time_yard_was_thoroughly_cleaned: body.last_time_yard_was_thoroughly_cleaned || 'one_week',
    initial_cleanup_required: true,
    terms_open_api: 1,
    marketing_allowed: body.consent ? 1 : 0,
    marketing_allowed_source: 'open_api',
    cross_sells: body.addons || [],
    consent: !!body.consent,
    coupon_id: body.coupon_id || '',
    yard_sqft: normalizeYardSqft(body.yard_sqft),
    yard_size: yardBucket(normalizeYardSqft(body.yard_sqft)),
  };
  if (settings.send_credit_card_link_after_registration) {
    payload.payment_method = 'credit_card';
    payload.send_credit_card_link = true;
    payload.credit_card_link_message = String(settings.credit_card_link_message || '').trim();
  }
  const id = await logLead(widget.account_id, widget.id, 'signup', payload, null);
  try {
    let response: any = { ok: true, destination: settings.lead_destination };
    if (settings.lead_destination === 'sng') {
      if (!token) throw new Error('Missing Sweep&Go API token.');
      response = await sngPut(settings, 'api/v1/residential/onboarding', payload, token);
    } else if (settings.lead_destination === 'ghl' || settings.lead_destination === 'jobber' || settings.lead_destination === 'generic') {
      response = await deliverWebhook(settings, 'signup', payload, id);
    } else {
      await sendMail(settings.email_to, 'New Titan Quote Tool signup', JSON.stringify(payload, null, 2));
      response = { ok: true, destination: 'email' };
    }
    await updateLeadResponse(id, response);
    res.json({ ok: true, entry_id: id, response });
  } catch (err: any) {
    const response = { ok: false, error: err.message || 'Could not submit signup.' };
    await updateLeadResponse(id, response);
    res.status(400).json(response);
  }
});

async function deliverWebhook(settings: any, event: string, payload: any, leadId: string) {
  const destination = settings.lead_destination;
  const url = destination === 'ghl'
    ? settings.ghl_webhook_url
    : destination === 'jobber'
      ? settings.jobber_webhook_url
      : destination === 'generic'
        ? settings.generic_webhook_url
        : '';
  if (!url) return { ok: true, skipped: true };
  const body = JSON.stringify({ source: 'titan-quote-tool', event, lead_id: leadId, submitted_at: new Date().toISOString(), payload });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = destination === 'generic' ? settings.generic_webhook_secret : destination === 'jobber' ? settings.jobber_webhook_secret : '';
  if (secret) {
    headers['X-TQT-Signature-Version'] = 'v1';
    headers['X-TQT-Signature'] = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }
  const res = await fetch(url, { method: 'POST', headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Webhook responded with HTTP ${res.status}: ${text}`);
  return { ok: true, destination, status: res.status, body: text };
}
