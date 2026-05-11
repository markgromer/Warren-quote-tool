import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { logApiEvent } from '../lib/repo.js';

export const stripeRouter = Router();

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: any };
};

const activeSubscriptionStatuses = new Set(['active', 'trialing']);
const disabledSubscriptionStatuses = new Set(['past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused']);

function safeString(value: any) {
  return value == null ? '' : String(value).trim();
}

function stripeSignatureIsValid(rawBody: Buffer, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(',').map(part => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

function eventObject(event: StripeEvent) {
  return event?.data?.object || {};
}

function metadataAccountId(obj: any) {
  const meta = obj?.metadata || {};
  return safeString(meta.account_id || meta.tqt_account_id || meta.accountId || obj?.client_reference_id);
}

function objectCustomerId(obj: any) {
  const customer = obj?.customer;
  if (typeof customer === 'object' && customer) return safeString(customer.id);
  return safeString(customer);
}

function objectSubscriptionId(obj: any) {
  const subscription = obj?.subscription || (obj?.object === 'subscription' ? obj?.id : '');
  if (typeof subscription === 'object' && subscription) return safeString(subscription.id);
  return safeString(subscription);
}

function objectEmail(obj: any) {
  return safeString(
    obj?.customer_details?.email ||
    obj?.customer_email ||
    obj?.receipt_email ||
    obj?.billing_details?.email ||
    obj?.metadata?.email ||
    obj?.metadata?.user_email,
  ).toLowerCase();
}

async function findAccountId(obj: any) {
  const directAccountId = metadataAccountId(obj);
  if (directAccountId) {
    const found = await query<{ id: string }>('SELECT id FROM accounts WHERE id = $1 LIMIT 1', [directAccountId]);
    if (found.rows[0]) return found.rows[0].id;
  }

  const subscriptionId = objectSubscriptionId(obj);
  if (subscriptionId) {
    const found = await query<{ id: string }>('SELECT id FROM accounts WHERE stripe_subscription_id = $1 LIMIT 1', [subscriptionId]);
    if (found.rows[0]) return found.rows[0].id;
  }

  const customerId = objectCustomerId(obj);
  if (customerId) {
    const found = await query<{ id: string }>('SELECT id FROM accounts WHERE stripe_customer_id = $1 LIMIT 1', [customerId]);
    if (found.rows[0]) return found.rows[0].id;
  }

  const email = objectEmail(obj);
  if (email) {
    const found = await query<{ id: string }>(
      `SELECT a.id
       FROM accounts a
       JOIN account_members am ON am.account_id = a.id
       JOIN users u ON u.id = am.user_id
       WHERE lower(u.email) = $1
       ORDER BY CASE WHEN am.role = 'owner' THEN 0 ELSE 1 END, a.created_at ASC
       LIMIT 1`,
      [email],
    );
    if (found.rows[0]) return found.rows[0].id;
  }

  return '';
}

async function updateAccountBilling(accountId: string, obj: any, plan: string, billingStatus: string) {
  const customerId = objectCustomerId(obj);
  const subscriptionId = objectSubscriptionId(obj);
  const sets = ['plan = $2', 'billing_status = $3', 'updated_at = now()'];
  const params: any[] = [accountId, plan, billingStatus];
  if (customerId) {
    params.push(customerId);
    sets.push(`stripe_customer_id = $${params.length}`);
  }
  if (subscriptionId) {
    params.push(subscriptionId);
    sets.push(`stripe_subscription_id = $${params.length}`);
  }
  await query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = $1`, params);
}

async function handleStripeEvent(event: StripeEvent) {
  const type = safeString(event.type);
  const obj = eventObject(event);
  const accountId = await findAccountId(obj);
  if (!accountId) {
    await logApiEvent(null, null, 'stripe_unmatched_event', {
      stripe_event_id: event.id || '',
      type,
      customer: objectCustomerId(obj),
      subscription: objectSubscriptionId(obj),
      email: objectEmail(obj),
      account_id_hint: metadataAccountId(obj),
    });
    return { matched: false };
  }

  if (type === 'checkout.session.completed') {
    const paymentStatus = safeString(obj.payment_status || obj.status).toLowerCase();
    const status = paymentStatus === 'paid' || paymentStatus === 'complete' ? 'active' : 'trialing';
    await updateAccountBilling(accountId, obj, 'pro', status);
  } else if (type === 'invoice.payment_succeeded' || type === 'invoice.paid') {
    await updateAccountBilling(accountId, obj, 'pro', 'active');
  } else if (type === 'invoice.payment_failed') {
    await updateAccountBilling(accountId, obj, 'pro', 'past_due');
  } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.resumed') {
    const subscriptionStatus = safeString(obj.status || 'active').toLowerCase();
    const billingStatus = activeSubscriptionStatuses.has(subscriptionStatus)
      ? subscriptionStatus
      : (disabledSubscriptionStatuses.has(subscriptionStatus) ? subscriptionStatus : 'past_due');
    await updateAccountBilling(accountId, obj, 'pro', billingStatus);
  } else if (type === 'customer.subscription.deleted') {
    await updateAccountBilling(accountId, obj, 'pro', 'canceled');
  } else {
    await logApiEvent(accountId, null, 'stripe_ignored_event', { stripe_event_id: event.id || '', type });
    return { matched: true, ignored: true };
  }

  await logApiEvent(accountId, null, 'stripe_billing_updated', {
    stripe_event_id: event.id || '',
    type,
    customer: objectCustomerId(obj),
    subscription: objectSubscriptionId(obj),
    email: objectEmail(obj),
  });
  return { matched: true };
}

stripeRouter.post('/webhook', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const secret = safeString(process.env.STRIPE_WEBHOOK_SECRET || process.env.WARREN_STRIPE_WEBHOOK_SECRET || process.env.TQT_STRIPE_WEBHOOK_SECRET);
  const signature = safeString(req.headers['stripe-signature']);

  if (secret) {
    if (!signature || !stripeSignatureIsValid(rawBody, signature, secret)) {
      return res.status(400).json({ ok: false, error: 'Invalid Stripe signature.' });
    }
  } else if (process.env.STRIPE_WEBHOOK_ALLOW_UNSIGNED !== '1') {
    return res.status(500).json({ ok: false, error: 'Stripe webhook secret is not configured.' });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'Invalid Stripe payload.' });
  }

  try {
    const result = await handleStripeEvent(event);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Stripe webhook failed', err);
    return res.status(500).json({ ok: false, error: 'Stripe webhook failed.' });
  }
});
