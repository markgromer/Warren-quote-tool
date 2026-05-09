import nodemailer from 'nodemailer';

export async function sendMail(to: string, subject: string, text: string) {
  if (!to) return { skipped: true };
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('SMTP_HOST not configured; email skipped:', subject);
    return { skipped: true };
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'Titan Quote Tool <noreply@example.com>',
    to,
    subject,
    text,
  });
}
