import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { appRouter } from './routes/app.js';
import { publicRouter } from './routes/public.js';
import { stripeRouter } from './routes/stripe.js';
import { widgetScript } from './widget/script.js';
import { sendMail } from './lib/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: true, credentials: true }));
app.use('/api/stripe', express.raw({ type: 'application/json' }), stripeRouter);
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/widget.js', (_req, res) => {
  res.type('application/javascript').send(widgetScript);
});

app.post('/api/demo-interest', async (req, res) => {
  const body = req.body || {};
  const email = String(body.business_email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid business email is required.' });
  }
  const recipient = process.env.DEMO_LEAD_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_TO || '';
  await sendMail(
    recipient,
    'WARREN demo interest',
    JSON.stringify({
      business_email: email,
      business_name: body.business_name || '',
      service_data_source: body.service_data_source || '',
      lead_destination: body.lead_destination || '',
      weekly_price: body.demo_weekly_price || '',
      biweekly_price: body.demo_biweekly_price || '',
      monthly_price: body.demo_monthly_price || '',
      one_time_price: body.demo_onetime_price || '',
      partial_email: !!body.enable_partial_lead_email,
      partial_sms: !!body.openphone_partial_quote_sms_enabled,
      signup_sms: !!body.openphone_signup_sms_enabled,
      submitted_at: new Date().toISOString(),
    }, null, 2)
  );
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/app', appRouter);
app.use('/public', publicRouter);

const clientDir = path.resolve(__dirname, '../client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`WARREN Quote Tool hosted app listening on ${port}`);
});
