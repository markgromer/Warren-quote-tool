import nodemailer from 'nodemailer';

export async function sendMail(to: string, subject: string, text: string, options: { cc?: string; bcc?: string } = {}) {
  if (!to) return { skipped: true, reason: 'missing_recipient' };
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('SMTP_HOST not configured; email skipped:', subject);
    return { skipped: true, reason: 'missing_smtp_host' };
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
