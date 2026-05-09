import crypto from 'node:crypto';

function key() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) return crypto.createHash('sha256').update('dev-only-titan-quote-tool').digest();
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length >= 32) return buf.subarray(0, 32);
  } catch {}
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const text = JSON.stringify(value ?? {});
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  };
}

export function decryptJson<T = any>(value: any, fallback: T): T {
  if (!value || typeof value !== 'object' || !value.iv || !value.tag || !value.data) return fallback;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return fallback;
  }
}
