import crypto from 'node:crypto';

const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('kwote:' + (process.env.DATABASE_URL || 'local-dev')).digest('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 32);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

function sign(v) {
  return crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
}

const COOKIE = 'kw_s';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function setSession(res, userId) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${userId}.${exp}`;
  const secure = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`
  );
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function readSession(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [id, exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!id || !exp || !sig) return null;
  const expected = sign(`${id}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return Number(id);
}
