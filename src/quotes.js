// Core quote logic shared by the web API and the MCP server.
// All arithmetic happens here, deterministically, so totals are always right.
import { randomKey } from './db.js';

export const STATUSES = ['draft', 'sent', 'viewed', 'changes_requested', 'accepted', 'declined'];

export const EDITABLE = [
  'title', 'client_name', 'client_company', 'client_email', 'summary',
  'line_items', 'timeline', 'terms', 'currency', 'tax_label', 'tax_rate',
  'discount', 'valid_until', 'status',
];

const num = (v, d = 0) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^0-9.\-]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (v, max = 20000) => (v == null ? '' : String(v)).slice(0, max);
const round2 = (n) => Math.round(n * 100) / 100;

export function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((it) => ({
    name: str(it?.name ?? it?.item ?? 'Item', 300) || 'Item',
    description: str(it?.description, 2000),
    qty: num(it?.qty ?? it?.quantity, 1),
    unit: str(it?.unit, 40),
    unit_price: num(it?.unit_price ?? it?.price ?? it?.rate, 0),
  }));
}

export function computeTotals(q) {
  const items = normalizeItems(q.line_items);
  const subtotal = round2(items.reduce((s, it) => s + it.qty * it.unit_price, 0));
  const discount = round2(Math.min(Math.max(num(q.discount), 0), subtotal));
  const taxable = round2(subtotal - discount);
  const tax = round2((taxable * num(q.tax_rate)) / 100);
  return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}

export function formatMoney(amount, currency = 'INR') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency, maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function toDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export function serializeQuote(row, baseUrl = '', events = undefined) {
  const totals = computeTotals(row);
  const out = {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    client_name: row.client_name,
    client_company: row.client_company,
    client_email: row.client_email,
    summary: row.summary,
    line_items: normalizeItems(row.line_items),
    timeline: row.timeline,
    terms: row.terms,
    currency: row.currency,
    tax_label: row.tax_label,
    tax_rate: Number(row.tax_rate),
    discount: Number(row.discount),
    valid_until: toDateStr(row.valid_until),
    totals,
    total_formatted: formatMoney(totals.total, row.currency),
    views: row.views,
    last_viewed_at: row.last_viewed_at,
    accepted_by: row.accepted_by,
    accepted_at: row.accepted_at,
    client_feedback: row.client_feedback,
    created_via: row.created_via,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slug: row.slug,
    client_link: `${baseUrl}/q/${row.slug}`,
    edit_link: `${baseUrl}/app#/quote/${row.id}`,
  };
  if (events) out.activity = events;
  return out;
}

function cleanPatch(data) {
  const p = {};
  for (const k of EDITABLE) {
    if (data[k] === undefined) continue;
    const v = data[k];
    if (k === 'line_items') p[k] = JSON.stringify(normalizeItems(v));
    else if (k === 'tax_rate' || k === 'discount') p[k] = num(v);
    else if (k === 'valid_until') p[k] = v ? toDateStr(v) : null;
    else if (k === 'status') {
      if (STATUSES.includes(v)) p[k] = v;
    } else if (k === 'currency') p[k] = str(v, 3).toUpperCase() || 'INR';
    else p[k] = str(v);
  }
  return p;
}

export async function logEvent(db, quoteId, type, detail = '') {
  await db.query('INSERT INTO events (quote_id, type, detail) VALUES ($1,$2,$3)', [quoteId, type, str(detail, 1000)]);
}

export async function getEvents(db, quoteId) {
  return db.query('SELECT type, detail, created_at FROM events WHERE quote_id=$1 ORDER BY created_at DESC, id DESC LIMIT 50', [quoteId]);
}

export async function createQuote(db, user, data, via = 'app') {
  const p = cleanPatch(data);
  const [{ c }] = await db.query('SELECT COUNT(*)::int AS c FROM quotes WHERE user_id=$1', [user.id]);
  const number = `Q-${new Date().getFullYear()}-${String(c + 1).padStart(3, '0')}`;
  const validUntil = p.valid_until ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const rows = await db.query(
    `INSERT INTO quotes (user_id, slug, number, title, client_name, client_company, client_email, summary,
      line_items, timeline, terms, currency, tax_label, tax_rate, discount, valid_until, status, created_via)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      user.id, randomKey(9), number,
      p.title || 'Untitled quote', p.client_name || '', p.client_company || '', p.client_email || '',
      p.summary || '', p.line_items || '[]', p.timeline || '', p.terms ?? user.default_terms ?? '',
      p.currency || user.currency || 'INR', p.tax_label ?? user.tax_label ?? 'GST',
      p.tax_rate ?? Number(user.tax_rate ?? 18), p.discount ?? 0, validUntil,
      p.status || 'draft', via,
    ]
  );
  await logEvent(db, rows[0].id, 'created', via === 'claude' ? 'Drafted by Claude via MCP' : 'Created in Kwote');
  return rows[0];
}

export async function updateQuote(db, userId, id, data, via = 'app') {
  const p = cleanPatch(data);
  const keys = Object.keys(p);
  if (!keys.length) return getQuoteRow(db, userId, id);
  const sets = keys.map((k, i) => `${k}=$${i + 3}${k === 'line_items' ? '::jsonb' : ''}`);
  const rows = await db.query(
    `UPDATE quotes SET ${sets.join(', ')}, updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING *`,
    [userId, id, ...keys.map((k) => p[k])]
  );
  if (!rows[0]) return null;
  const label = keys.map((k) => k.replace(/_/g, ' ')).join(', ');
  await logEvent(db, id, 'edited', `${via === 'claude' ? 'Claude updated' : 'You edited'}: ${label}`);
  return rows[0];
}

export async function getQuoteRow(db, userId, id) {
  const rows = await db.query('SELECT * FROM quotes WHERE user_id=$1 AND id=$2', [userId, Number(id) || 0]);
  return rows[0] || null;
}

export async function listQuoteRows(db, userId, status) {
  if (status && STATUSES.includes(status)) {
    return db.query('SELECT * FROM quotes WHERE user_id=$1 AND status=$2 ORDER BY updated_at DESC', [userId, status]);
  }
  return db.query('SELECT * FROM quotes WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
}

export async function deleteQuote(db, userId, id) {
  const rows = await db.query('DELETE FROM quotes WHERE user_id=$1 AND id=$2 RETURNING id', [userId, Number(id) || 0]);
  return rows.length > 0;
}

export function profileOf(user) {
  return {
    business_name: user.business_name,
    business_tagline: user.business_tagline,
    business_email: user.business_email,
    currency: user.currency,
    tax_label: user.tax_label,
    tax_rate: Number(user.tax_rate),
    rate_card: user.rate_card,
    default_terms: user.default_terms,
  };
}

export const PROFILE_FIELDS = ['business_name', 'business_tagline', 'business_email', 'currency', 'tax_label', 'tax_rate', 'rate_card', 'default_terms'];

export async function updateProfile(db, userId, data) {
  const p = {};
  for (const k of PROFILE_FIELDS) {
    if (data[k] === undefined) continue;
    p[k] = k === 'tax_rate' ? num(data[k]) : k === 'currency' ? str(data[k], 3).toUpperCase() : str(data[k]);
  }
  const keys = Object.keys(p);
  if (!keys.length) return (await db.query('SELECT * FROM users WHERE id=$1', [userId]))[0];
  const rows = await db.query(
    `UPDATE users SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(', ')} WHERE id=$1 RETURNING *`,
    [userId, ...keys.map((k) => p[k])]
  );
  return rows[0];
}
