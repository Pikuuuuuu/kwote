// Database layer. Uses Postgres (Neon / Render / any) when DATABASE_URL is set,
// otherwise an embedded Postgres (PGlite) for local development.
import crypto from 'node:crypto';

let dbPromise = null;

async function connect() {
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    const url = process.env.DATABASE_URL;
    const needsSsl = !/localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      max: 3,
      idleTimeoutMillis: 10000,
    });
    return {
      query: async (text, params = []) => (await pool.query(text, params)).rows,
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || undefined; // in-memory if undefined
  const db = new PGlite(dir);
  return {
    query: async (text, params = []) => (await db.query(text, params)).rows,
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  mcp_key TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  business_tagline TEXT NOT NULL DEFAULT '',
  business_email TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  tax_label TEXT NOT NULL DEFAULT 'GST',
  tax_rate NUMERIC NOT NULL DEFAULT 18,
  rate_card TEXT NOT NULL DEFAULT '',
  default_terms TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled quote',
  client_name TEXT NOT NULL DEFAULT '',
  client_company TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  tax_label TEXT NOT NULL DEFAULT 'GST',
  tax_rate NUMERIC NOT NULL DEFAULT 18,
  discount NUMERIC NOT NULL DEFAULT 0,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  accepted_by TEXT,
  accepted_at TIMESTAMPTZ,
  client_feedback TEXT,
  created_via TEXT NOT NULL DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_user_idx ON quotes(user_id);
CREATE INDEX IF NOT EXISTS events_quote_idx ON events(quote_id);
`;

export function randomKey(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await connect();
      for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
        await db.query(stmt);
      }
      const { seedDemo } = await import('./seed.js');
      await seedDemo(db);
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
