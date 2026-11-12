// Remote MCP server (Streamable HTTP, stateless). Each customer gets a private URL:
//   https://<host>/mcp/<their-key>
// Claude does the thinking and writing; these tools only save, read and update data.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';
import { getDb } from './db.js';
import {
  STATUSES, createQuote, updateQuote, getQuoteRow, listQuoteRows, serializeQuote,
  getEvents, profileOf, updateProfile, formatMoney,
} from './quotes.js';

const lineItem = z.object({
  name: z.string().describe('Short name of the service or deliverable'),
  description: z.string().optional().describe('One line on what is included'),
  qty: z.number().default(1).describe('Quantity'),
  unit: z.string().optional().describe('Unit, e.g. "page", "hour", "project"'),
  unit_price: z.number().describe('Price per unit, before tax, in the quote currency'),
});

const quoteFields = {
  title: z.string().describe('Quote title, e.g. "Brand identity for Acme"'),
  client_name: z.string().describe("Client contact's name"),
  client_company: z.string().optional(),
  client_email: z.string().optional(),
  summary: z.string().describe('2–4 sentence intro to the client: the goal and what they will get'),
  line_items: z.array(lineItem).describe('Priced deliverables. Use the rate card from get_business_profile.'),
  timeline: z.string().optional().describe('Delivery plan, one phase per line'),
  terms: z.string().optional().describe('Payment and project terms. Omit to use the business default terms.'),
  currency: z.string().optional().describe('ISO code, e.g. INR, USD. Omit to use the business default.'),
  tax_rate: z.number().optional().describe('Tax percent. Omit to use the business default.'),
  discount: z.number().optional().describe('Flat discount amount before tax'),
  valid_until: z.string().optional().describe('YYYY-MM-DD. Defaults to 14 days from today.'),
};

function shortQuote(q) {
  return {
    id: q.id, number: q.number, title: q.title, client: [q.client_name, q.client_company].filter(Boolean).join(', '),
    status: q.status, total: q.total_formatted, views: q.views,
    accepted_by: q.accepted_by || undefined, client_feedback: q.client_feedback || undefined,
    client_link: q.client_link, edit_link: q.edit_link, updated_at: q.updated_at,
  };
}

const text = (obj, lead = '') => ({
  content: [{ type: 'text', text: (lead ? lead + '\n\n' : '') + JSON.stringify(obj, null, 2) }],
});

function buildServer(user, baseUrl) {
  const server = new McpServer(
    { name: 'kwote', version: '1.0.0' },
    {
      instructions:
        `Kwote stores and tracks client quotes for ${user.business_name || 'this business'}. ` +
        'Before drafting a quote, call get_business_profile and price line items from its rate card, currency and tax settings. ' +
        'Kwote computes all totals and tax itself, so never add tax into unit prices. ' +
        'After creating or updating a quote, share the edit_link (for the owner) and client_link (to send to the client).',
    }
  );

  server.registerTool('get_business_profile', {
    title: 'Get business profile & rate card',
    description: "Returns the business's name, default currency, tax settings, rate card (standard prices) and default terms. Call this before drafting any quote.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    const db = await getDb();
    const [u] = await db.query('SELECT * FROM users WHERE id=$1', [user.id]);
    return text(profileOf(u));
  });

  server.registerTool('create_quote', {
    title: 'Create a quote',
    description: 'Saves a new client quote in Kwote as a draft. Kwote calculates subtotal, tax and total, and returns a private edit link plus a live client link where the client can accept the quote or request changes.',
    inputSchema: quoteFields,
  }, async (args) => {
    const db = await getDb();
    const [u] = await db.query('SELECT * FROM users WHERE id=$1', [user.id]);
    const row = await createQuote(db, u, args, 'claude');
    const q = serializeQuote(row, baseUrl);
    return text(
      { ...shortQuote(q), totals: q.totals, currency: q.currency },
      `Created ${q.number} "${q.title}" for ${formatMoney(q.totals.total, q.currency)} (incl. ${q.tax_label} ${q.tax_rate}%). Status: draft.\nEdit in Kwote: ${q.edit_link}\nClient link: ${q.client_link}`
    );
  });

  server.registerTool('list_quotes', {
    title: 'List quotes',
    description: 'Lists quotes with status (draft, sent, viewed, changes_requested, accepted, declined), totals, client views and any client feedback. Use it to follow up, find quotes needing changes, or report pipeline.',
    inputSchema: { status: z.enum(STATUSES).optional().describe('Filter by status') },
    annotations: { readOnlyHint: true },
  }, async ({ status }) => {
    const db = await getDb();
    const rows = await listQuoteRows(db, user.id, status);
    const quotes = rows.map((r) => shortQuote(serializeQuote(r, baseUrl)));
    return text({ count: quotes.length, quotes });
  });

  server.registerTool('get_quote', {
    title: 'Get a quote',
    description: 'Returns the full quote: line items, totals, status, client feedback and activity history (views, acceptance, edits).',
    inputSchema: { quote_id: z.number().int().describe('Quote id from list_quotes or create_quote') },
    annotations: { readOnlyHint: true },
  }, async ({ quote_id }) => {
    const db = await getDb();
    const row = await getQuoteRow(db, user.id, quote_id);
    if (!row) return { isError: true, content: [{ type: 'text', text: `No quote with id ${quote_id}.` }] };
    return text(serializeQuote(row, baseUrl, await getEvents(db, row.id)));
  });

  server.registerTool('update_quote', {
    title: 'Update a quote',
    description: 'Changes an existing quote. Send only the fields to change. line_items, if sent, replaces the whole list. Set status to "sent" once the owner has shared the client link.',
    inputSchema: {
      quote_id: z.number().int(),
      ...Object.fromEntries(Object.entries(quoteFields).map(([k, v]) => [k, v.optional()])),
      status: z.enum(STATUSES).optional(),
    },
  }, async ({ quote_id, ...patch }) => {
    const db = await getDb();
    const row = await updateQuote(db, user.id, quote_id, patch, 'claude');
    if (!row) return { isError: true, content: [{ type: 'text', text: `No quote with id ${quote_id}.` }] };
    const q = serializeQuote(row, baseUrl);
    return text({ ...shortQuote(q), totals: q.totals }, `Updated ${q.number}. New total ${q.total_formatted}.`);
  });

  server.registerTool('update_business_profile', {
    title: 'Update business profile',
    description: 'Updates the business name, defaults, rate card or default terms that future quotes use.',
    inputSchema: {
      business_name: z.string().optional(),
      business_tagline: z.string().optional(),
      business_email: z.string().optional(),
      currency: z.string().optional(),
      tax_label: z.string().optional(),
      tax_rate: z.number().optional(),
      rate_card: z.string().optional().describe('One service per line with its price'),
      default_terms: z.string().optional(),
    },
  }, async (args) => {
    const db = await getDb();
    const u = await updateProfile(db, user.id, args);
    return text(profileOf(u), 'Business profile updated.');
  });

  return server;
}

export function baseUrlOf(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

export async function handleMcp(req, res) {
  if (req.method !== 'POST') {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server is stateless; use POST.' }, id: null });
    return;
  }
  const db = await getDb();
  const [user] = await db.query('SELECT * FROM users WHERE mcp_key=$1', [req.params.key]);
  if (!user) {
    res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unknown Kwote MCP link. Copy your link from Kwote → Connect Claude.' }, id: null });
    return;
  }
  const server = buildServer(user, baseUrlOf(req));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
