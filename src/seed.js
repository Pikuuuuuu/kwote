import { hashPassword } from './auth.js';
import { createQuote, logEvent } from './quotes.js';

export const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@kwote.app';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';
export const DEMO_MCP_KEY = process.env.DEMO_MCP_KEY || 'kw_demo_4QmZ8vT2xLp';

const RATE_CARD = `Brand identity (logo, colours, type, guidelines PDF): ₹45,000
Logo only (3 concepts, 2 revision rounds): ₹18,000
Website UI design, per page (Figma): ₹8,000
Website build in Framer/Webflow, per page: ₹6,000
Landing page, design + build: ₹35,000
Social media kit (10 editable templates): ₹12,000
Pitch deck design, per slide: ₹1,200
Extra revisions beyond 2 rounds: ₹1,500 per hour
Rush delivery (under 7 days): +25% on the project total`;

const TERMS = `50% advance to start, 50% on final delivery.
Two rounds of revisions are included; further changes are billed hourly.
Invoices are payable within 7 days by UPI or bank transfer.
Source files are handed over after the final payment.`;

export async function seedDemo(db) {
  const existing = await db.query('SELECT id FROM users WHERE email=$1', [DEMO_EMAIL]);
  if (existing.length) return;
  const [user] = await db.query(
    `INSERT INTO users (email, name, password_hash, mcp_key, business_name, business_tagline, business_email,
       currency, tax_label, tax_rate, rate_card, default_terms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'INR','GST',18,$8,$9)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [DEMO_EMAIL, 'Demo Founder', hashPassword(DEMO_PASSWORD), DEMO_MCP_KEY, 'Northlight Studio',
     'Brand & web design · Bengaluru', 'hello@northlight.studio', RATE_CARD, TERMS]
  );
  if (!user) return; // another instance seeded concurrently

  const q1 = await createQuote(db, user, {
    title: 'Brand identity for Brew & Bloom Café',
    client_name: 'Ananya Rao', client_company: 'Brew & Bloom Café', client_email: 'ananya@brewbloom.in',
    summary: 'A warm, hand-crafted identity for your first café in Indiranagar, ready for signage, cups and Instagram before the March opening.',
    line_items: [
      { name: 'Brand identity', description: 'Logo, colour palette, typography and a 12-page guidelines PDF', qty: 1, unit: 'project', unit_price: 45000 },
      { name: 'Social media kit', description: '10 editable Instagram templates in Canva', qty: 1, unit: 'kit', unit_price: 12000 },
      { name: 'Menu board design', description: 'Two A1 menu boards, print-ready', qty: 2, unit: 'board', unit_price: 4000 },
    ],
    timeline: 'Week 1: discovery and moodboards\nWeek 2: logo concepts\nWeek 3: refinement and guidelines\nWeek 4: social kit and menu boards',
  }, 'claude');
  await db.query(`UPDATE quotes SET status='accepted', views=4, accepted_by='Ananya Rao',
    accepted_at=now() - interval '2 days', last_viewed_at=now() - interval '2 days',
    created_at=now() - interval '6 days', updated_at=now() - interval '2 days' WHERE id=$1`, [q1.id]);
  await logEvent(db, q1.id, 'viewed', 'Client opened the quote');
  await logEvent(db, q1.id, 'accepted', 'Accepted by Ananya Rao');

  const q2 = await createQuote(db, user, {
    title: 'Landing page for FinPeak launch',
    client_name: 'Rohit Mehta', client_company: 'FinPeak', client_email: 'rohit@finpeak.io',
    summary: 'A high-converting launch page for FinPeak’s expense app, designed in Figma and built in Framer so your team can edit it.',
    line_items: [
      { name: 'Landing page, design + build', description: 'Hero, features, pricing, FAQ and waitlist form', qty: 1, unit: 'page', unit_price: 35000 },
      { name: 'Extra page: Pricing', description: 'Design and build', qty: 1, unit: 'page', unit_price: 14000 },
    ],
    discount: 4000,
    timeline: '2 weeks from advance payment',
  }, 'claude');
  await db.query(`UPDATE quotes SET status='viewed', views=2, last_viewed_at=now() - interval '3 hours',
    created_at=now() - interval '1 day', updated_at=now() - interval '3 hours' WHERE id=$1`, [q2.id]);
  await logEvent(db, q2.id, 'viewed', 'Client opened the quote');
}
