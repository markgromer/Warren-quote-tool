import nodemailer from 'nodemailer';

function splitRecipients(value: string) {
  return String(value || '')
    .split(/[,\n;]/)
    .map(item => cleanAddressValue(item))
    .filter(Boolean);
}

function cleanAddressValue(value: string) {
  let out = String(value || '').trim();
  for (let i = 0; i < 5 && out.length >= 2; i++) {
    if ((out.startsWith('\\"') && out.endsWith('\\"')) || (out.startsWith("\\'") && out.endsWith("\\'"))) {
      out = out.slice(2, -2).trim();
      continue;
    }
    if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
      out = out.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return out;
}

function addressLooksValid(value: string) {
  const raw = cleanAddressValue(value);
  if (!raw) return false;
  const match = raw.match(/<([^<>]+)>$/);
  const email = String(match ? match[1] : raw).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

async function sendResendMail(to: string, subject: string, text: string, options: { cc?: string; bcc?: string } = {}) {
  const apiKey = String(process.env.RESEND_API_KEY || process.env.TQT_RESEND_API_KEY || process.env.RESEND_KEY || '').trim();
  if (!apiKey) return null;

  const recipients = splitRecipients(to);
  if (!recipients.length) return { skipped: true, reason: 'missing_recipient' };

  const from = String(
    process.env.RESEND_FROM
    || process.env.MAIL_FROM
    || process.env.SMTP_FROM
    || 'WARREN Quote Tool <onboarding@resend.dev>',
  ).trim();
  const replyTo = cleanAddressValue(String(process.env.RESEND_REPLY_TO || process.env.MAIL_REPLY_TO || ''));
  const payload: Record<string, any> = {
    from: cleanAddressValue(from),
    to: recipients,
    subject,
    text,
  };
  const cc = splitRecipients(options.cc || '');
  const bcc = splitRecipients(options.bcc || '');
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;
  if (replyTo && addressLooksValid(replyTo)) {
    payload.reply_to = replyTo;
  } else if (replyTo) {
    console.warn('Invalid Resend reply_to ignored:', replyTo);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || data?.error || `Resend email failed with HTTP ${res.status}.`;
    throw new Error(message);
  }
  return { sent: true, skipped: false, provider: 'resend', messageId: data?.id || '', accepted: payload.to };
}

export async function sendMail(to: string, subject: string, text: string, options: { cc?: string; bcc?: string } = {}) {
  if (!to) return { skipped: true, reason: 'missing_recipient' };
  const provider = String(process.env.EMAIL_PROVIDER || process.env.MAIL_PROVIDER || 'resend').trim().toLowerCase();
  const resendResult = await sendResendMail(to, subject, text, options);
  if (resendResult) return resendResult;

  if (provider !== 'smtp') {
    console.warn('Resend email provider is not configured; email skipped:', subject);
    return { skipped: true, reason: 'missing_resend_api_key', provider: 'resend' };
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('No email provider configured; email skipped:', subject);
    return { skipped: true, reason: 'missing_email_provider' };
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE
    ? ['1', 'true', 'yes'].includes(String(process.env.SMTP_SECURE).toLowerCase())
    : port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 15000),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'WARREN Quote Tool <noreply@example.com>',
    to,
    cc: options.cc || undefined,
    bcc: options.bcc || undefined,
    subject,
    text,
  });
}
