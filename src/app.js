import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getDb, randomKey } from './db.js';
import { hashPassword, verifyPassword, setSession, clearSession, readSession } from './auth.js';
import {
  createQuote, updateQuote, getQuoteRow, listQuoteRows, deleteQuote, serializeQuote,
  getEvents, logEvent, profileOf, updateProfile, computeTotals,
} from './quotes.js';
import { handleMcp, baseUrlOf } from './mcp.js';
import { landingPage, authPage, clientQuotePage, notFoundPage } from './views.js';
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

export const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- MCP ----------
app.use('/mcp', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.all('/mcp/:key', express.json({ limit: '2mb' }), wrap(handleMcp));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// ---------- auth helpers ----------
async function currentUser(req) {
  const id = readSession(req);
  if (!id) return null;
  const db = await getDb();
  const [u] = await db.query('SELECT * FROM users WHERE id=$1', [id]);
  return u || null;
}
const requireApi = wrap(async (req, res, next) => {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  req.user = u;
  next();
});

// ---------- pages ----------
app.get('/', wrap(async (req, res) => {
  const u = await currentUser(req);
  res.type('html').send(landingPage({ signedIn: !!u, demoEmail: DEMO_EMAIL, demoPassword: DEMO_PASSWORD }));
}));

app.get('/login', (req, res) => res.type('html').send(authPage('login', { demoEmail: DEMO_EMAIL, demoPassword: DEMO_PASSWORD })));
app.get('/signup', (req, res) => res.type('html').send(authPage('signup', {})));

app.post('/login', wrap(async (req, res) => {
  const db = await getDb();
  const email = String(req.body.email || '').trim().toLowerCase();
  const [u] = await db.query('SELECT * FROM users WHERE email=$1', [email]);
  if (!u || !verifyPassword(String(req.body.password || ''), u.password_hash)) {
    return res.status(401).type('html').send(authPage('login', { error: 'Wrong email or password.', email, demoEmail: DEMO_EMAIL, demoPassword: DEMO_PASSWORD }));
  }
  setSession(res, u.id);
  res.redirect(303, '/app');
}));

app.post('/signup', wrap(async (req, res) => {
  const db = await getDb();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const business = String(req.body.business_name || '').trim().slice(0, 120);
  const name = String(req.body.name || '').trim().slice(0, 120);
  const fail = (error) => res.status(400).type('html').send(authPage('signup', { error, email, business, name }));
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email.');
  if (password.length < 6) return fail('Password needs at least 6 characters.');
  const exists = await db.query('SELECT 1 FROM users WHERE email=$1', [email]);
  if (exists.length) return fail('An account with this email already exists.');
  const [u] = await db.query(
    `INSERT INTO users (email, name, password_hash, mcp_key, business_name, business_email, default_terms)
     VALUES ($1,$2,$3,$4,$5,$1,$6) RETURNING *`,
    [email, name, hashPassword(password), 'kw_' + randomKey(16), business || name || 'My business',
     '50% advance, 50% on delivery. Payable within 7 days of invoice.']
  );
  setSession(res, u.id);
  res.redirect(303, '/app#/connect');
}));

app.post('/logout', (req, res) => { clearSession(res); res.redirect(303, '/'); });

app.get('/app', wrap(async (req, res) => {
  const u = await currentUser(req);
  if (!u) return res.redirect(303, '/login');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLIC, 'app.html'));
}));

// ---------- JSON API ----------
app.get('/api/me', requireApi, (req, res) => {
  const u = req.user;
  res.json({
    email: u.email, name: u.name, profile: profileOf(u),
    mcp_url: `${baseUrlOf(req)}/mcp/${u.mcp_key}`,
  });
});

app.put('/api/profile', requireApi, wrap(async (req, res) => {
  const u = await updateProfile(await getDb(), req.user.id, req.body || {});
  res.json(profileOf(u));
}));

app.post('/api/mcp-key/rotate', requireApi, wrap(async (req, res) => {
  const db = await getDb();
  const key = 'kw_' + randomKey(16);
  await db.query('UPDATE users SET mcp_key=$2 WHERE id=$1', [req.user.id, key]);
  res.json({ mcp_url: `${baseUrlOf(req)}/mcp/${key}` });
}));

app.get('/api/quotes', requireApi, wrap(async (req, res) => {
  const rows = await listQuoteRows(await getDb(), req.user.id, req.query.status);
  res.json(rows.map((r) => serializeQuote(r, baseUrlOf(req))));
}));

app.post('/api/quotes', requireApi, wrap(async (req, res) => {
  const row = await createQuote(await getDb(), req.user, req.body || {}, 'app');
  res.status(201).json(serializeQuote(row, baseUrlOf(req)));
}));

app.get('/api/quotes/:id', requireApi, wrap(async (req, res) => {
  const db = await getDb();
  const row = await getQuoteRow(db, req.user.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(serializeQuote(row, baseUrlOf(req), await getEvents(db, row.id)));
}));

app.put('/api/quotes/:id', requireApi, wrap(async (req, res) => {
  const db = await getDb();
  const row = await updateQuote(db, req.user.id, Number(req.params.id), req.body || {}, 'app');
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(serializeQuote(row, baseUrlOf(req), await getEvents(db, row.id)));
}));

app.delete('/api/quotes/:id', requireApi, wrap(async (req, res) => {
  const ok = await deleteQuote(await getDb(), req.user.id, req.params.id);
  res.status(ok ? 204 : 404).end();
}));

// ---------- public client page ----------
async function quoteBySlug(slug) {
  const db = await getDb();
  const [row] = await db.query(
    `SELECT q.*, u.business_name, u.business_tagline, u.business_email
       FROM quotes q JOIN users u ON u.id=q.user_id WHERE q.slug=$1`, [slug]);
  return row;
}

app.get('/q/:slug', wrap(async (req, res) => {
  const db = await getDb();
  const row = await quoteBySlug(req.params.slug);
  if (!row) return res.status(404).type('html').send(notFoundPage());
  const isOwner = readSession(req) === row.user_id;
  if (!isOwner && req.method === 'GET') {
    const nextStatus = ['draft', 'sent'].includes(row.status) ? 'viewed' : row.status;
    await db.query('UPDATE quotes SET views=views+1, last_viewed_at=now(), status=$2 WHERE id=$1', [row.id, nextStatus]);
    // Avoid flooding the log: one "viewed" event per 30 minutes.
    const recent = await db.query(`SELECT 1 FROM events WHERE quote_id=$1 AND type='viewed' AND created_at > now() - interval '30 minutes'`, [row.id]);
    if (!recent.length) await logEvent(db, row.id, 'viewed', 'Client opened the quote');
    row.status = nextStatus;
  }
  res.set('Cache-Control', 'no-store');
  res.type('html').send(clientQuotePage(serializeQuote(row), row, { isOwner, flash: req.query.done }));
}));

app.post('/q/:slug/accept', wrap(async (req, res) => {
  const db = await getDb();
  const row = await quoteBySlug(req.params.slug);
  if (!row) return res.status(404).type('html').send(notFoundPage());
  const name = String(req.body.name || '').trim().slice(0, 120);
  if (!name) return res.redirect(303, `/q/${row.slug}?done=need-name`);
  if (row.status !== 'accepted') {
    await db.query(`UPDATE quotes SET status='accepted', accepted_by=$2, accepted_at=now(), updated_at=now() WHERE id=$1`, [row.id, name]);
    const t = computeTotals(row);
    await logEvent(db, row.id, 'accepted', `Accepted by ${name} (total ${t.total} ${row.currency})`);
  }
  res.redirect(303, `/q/${row.slug}?done=accepted`);
}));

app.post('/q/:slug/feedback', wrap(async (req, res) => {
  const db = await getDb();
  const row = await quoteBySlug(req.params.slug);
  if (!row) return res.status(404).type('html').send(notFoundPage());
  const msg = String(req.body.message || '').trim().slice(0, 2000);
  const name = String(req.body.name || '').trim().slice(0, 120);
  if (!msg) return res.redirect(303, `/q/${row.slug}`);
  if (row.status === 'accepted') return res.redirect(303, `/q/${row.slug}`);
  const full = name ? `${name}: ${msg}` : msg;
  await db.query(`UPDATE quotes SET status='changes_requested', client_feedback=$2, updated_at=now() WHERE id=$1`, [row.id, full]);
  await logEvent(db, row.id, 'feedback', `Client asked for changes: ${full}`);
  res.redirect(303, `/q/${row.slug}?done=feedback`);
}));

app.use((req, res) => res.status(404).type('html').send(notFoundPage()));

app.use((err, req, res, _next) => {
  const id = crypto.randomBytes(4).toString('hex');
  console.error(`[${id}]`, err);
  if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) {
    return res.status(500).json({ error: 'Something went wrong', ref: id });
  }
  res.status(500).type('html').send(notFoundPage('Something went wrong. Please try again.'));
});

export default app;
