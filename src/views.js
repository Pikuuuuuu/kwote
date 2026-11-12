import { formatMoney } from './quotes.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const head = (title, desc = 'Your Claude writes the quote. Kwote gets it accepted.') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%231d4d3a'/%3E%3Cpath d='M9 9h14v14H9z' rx='3' fill='%23d8f5a2'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css"></head>`;

const logo = `<a class="logo" href="/"><span class="logo-mark"></span>Kwote</a>`;

export function landingPage({ signedIn, demoEmail, demoPassword }) {
  return `${head('Kwote — quotes written by your Claude, accepted by your clients')}
<body>
<header class="l-nav">${logo}<nav>
${signedIn ? `<a class="btn primary" href="/app">Open Kwote</a>` : `<a class="btn ghost" href="/login">Log in</a><a class="btn primary" href="/signup">Start free</a>`}
</nav></header>

<section class="l-hero">
  <div>
    <span class="l-eyebrow"><b>●</b> Works inside Claude through MCP · no AI fees for you</span>
    <h1>Your Claude writes the quote. <em>Kwote gets it accepted.</em></h1>
    <p class="lead">Paste a client brief into Claude. It drafts a priced proposal from your own rate card and saves it straight into Kwote. You tidy it up, send one link, and your client accepts in a click. You can see the moment they open it.</p>
    <div class="l-cta">
      <a class="btn primary lg" href="${signedIn ? '/app' : '/signup'}">${signedIn ? 'Open your quotes' : 'Create your free account'}</a>
      <a class="btn lg" href="/login">Try the demo</a>
    </div>
    <p class="l-demo">Demo login: <code>${esc(demoEmail)}</code> / <code>${esc(demoPassword)}</code></p>
  </div>
  <div class="chat" aria-label="Example conversation in Claude">
    <div class="bubble me">Rohit from FinPeak needs a launch landing page plus a pricing page in 2 weeks. Quote it with our usual terms.</div>
    <div class="tool">kwote · get_business_profile</div>
    <div class="tool">kwote · create_quote</div>
    <div class="bubble claude">Done. I priced it from your rate card and saved it in Kwote as a draft.
      <div class="card" style="margin-top:10px">
        <div class="row"><b>Q-2026-014 · Landing page for FinPeak</b><span class="pill draft">Draft</span></div>
        <div class="row muted"><span>Landing page, design + build</span><span class="num">₹35,000</span></div>
        <div class="row muted"><span>Extra page: Pricing</span><span class="num">₹14,000</span></div>
        <div class="row"><span>Total incl. GST 18%</span><b class="num">₹57,820</b></div>
      </div>
    </div>
  </div>
</section>

<section class="l-section">
  <h2>How it works</h2>
  <div class="l-grid">
    <div class="l-card"><div class="k">01 · In Claude</div><h3>Describe the job</h3><p>Paste an email, call notes or a WhatsApp thread. Claude reads your rate card and terms from Kwote and writes the scope, line items and timeline.</p></div>
    <div class="l-card"><div class="k">02 · In Kwote</div><h3>Check and edit</h3><p>The quote appears on your dashboard. Change any line, price or term. Kwote does the maths, including GST and discounts, so the total is always right.</p></div>
    <div class="l-card"><div class="k">03 · With your client</div><h3>Send one link</h3><p>Your client opens a clean, branded page and can accept or ask for changes. You see each view and response. Claude can read the feedback and revise.</p></div>
  </div>
</section>

<section class="l-section">
  <h2>Why not just ask Claude?</h2>
  <div class="l-split">
    <div class="l-card"><h3>Claude alone</h3><ul>
      <li>Writes a great draft, then it's stuck in a chat window</li>
      <li>Forgets your prices and terms in every new chat</li>
      <li>Can get the arithmetic wrong</li>
      <li>No link to send, so no way to see if the client read it</li>
      <li>No record of what you've quoted or won</li>
    </ul></div>
    <div class="l-card"><h3>Claude + Kwote</h3><ul>
      <li>Every quote is saved, editable and live on the web</li>
      <li>Your rate card and terms are used every time</li>
      <li>Totals and tax are calculated exactly</li>
      <li>One-click acceptance, with each view and response tracked</li>
      <li>A pipeline of everything you've quoted, won and lost</li>
    </ul></div>
  </div>
</section>

<section class="l-section">
  <h2>Simple pricing</h2>
  <div class="l-price">
    <div class="l-card"><div class="k">Free</div><div class="amt">₹0</div><p>3 live quotes a month, Claude connector, client acceptance, "Sent with Kwote" footer.</p></div>
    <div class="l-card feature"><div class="k">Pro</div><div class="amt">₹499<span class="small muted">/month</span></div><p>Unlimited quotes, your own branding, view alerts, follow-up reminders, PDF export.</p></div>
    <div class="l-card"><div class="k">Studio</div><div class="amt">₹1,499<span class="small muted">/month</span></div><p>Up to 5 team members, shared rate cards, pipeline reports.</p></div>
  </div>
</section>

<footer class="l-foot"><span>© ${new Date().getFullYear()} Kwote</span><span>No AI runs inside Kwote. Your own Claude does the writing.</span></footer>
</body></html>`;
}

export function authPage(mode, { error, email = '', business = '', name = '', demoEmail, demoPassword }) {
  const login = mode === 'login';
  return `${head(login ? 'Log in · Kwote' : 'Create account · Kwote')}
<body><div class="auth-wrap"><div class="auth">
${logo}
<h1>${login ? 'Welcome back' : 'Create your Kwote account'}</h1>
<p class="muted small" style="margin:0">${login ? 'Log in to see your quotes.' : 'Free to start. Connect your Claude in under a minute.'}</p>
<form method="post" action="/${mode}">
${error ? `<div class="err">${esc(error)}</div>` : ''}
${login ? '' : `<label class="field"><span>Your name</span><input name="name" value="${esc(name)}" autocomplete="name"></label>
<label class="field"><span>Business name</span><input name="business_name" value="${esc(business)}" placeholder="e.g. Northlight Studio"></label>`}
<label class="field"><span>Email</span><input name="email" type="email" required value="${esc(email)}" autocomplete="email"></label>
<label class="field"><span>Password</span><input name="password" type="password" required minlength="6" autocomplete="${login ? 'current-password' : 'new-password'}"></label>
<button class="btn primary lg" type="submit">${login ? 'Log in' : 'Create account'}</button>
</form>
<p class="small muted" style="margin:16px 0 0">${login ? `New here? <a href="/signup">Create an account</a>` : `Already have an account? <a href="/login">Log in</a>`}</p>
${login && demoEmail ? `<div class="demo">Demo account: <code>${esc(demoEmail)}</code> / <code>${esc(demoPassword)}</code></div>` : ''}
</div></div></body></html>`;
}

const STATUS_LABEL = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed', changes_requested: 'Changes requested', accepted: 'Accepted', declined: 'Declined',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function clientQuotePage(q, row, { isOwner, flash }) {
  const m = (n) => formatMoney(n, q.currency);
  const items = q.line_items.map((it) => `<tr>
    <td><div class="iname">${esc(it.name)}</div>${it.description ? `<div class="idesc">${esc(it.description)}</div>` : ''}</td>
    <td class="r num">${esc(it.qty)}${it.unit ? ` <span class="muted small">${esc(it.unit)}</span>` : ''}</td>
    <td class="r num">${m(it.unit_price)}</td>
    <td class="r num">${m(it.qty * it.unit_price)}</td></tr>`).join('');
  const accepted = q.status === 'accepted';
  const banners = [];
  if (isOwner) banners.push(`<div class="banner info no-print">You're viewing your own quote as the client sees it. Your visits aren't counted as views. <a href="/app#/quote/${q.id}">Back to editor</a></div>`);
  if (flash === 'accepted') banners.push(`<div class="banner ok">Thank you! The quote is accepted and ${esc(row.business_name)} has been notified.</div>`);
  if (flash === 'feedback') banners.push(`<div class="banner warn">Thanks, your feedback was sent. ${esc(row.business_name)} will send a revised quote.</div>`);
  if (flash === 'need-name') banners.push(`<div class="banner warn">Please type your name to accept.</div>`);
  if (q.status === 'changes_requested' && !flash && q.client_feedback) banners.push(`<div class="banner warn">Changes requested: “${esc(q.client_feedback)}”. A revised version is on its way.</div>`);

  return `${head(`${q.title} · ${row.business_name}`, `Quote ${q.number} from ${row.business_name}`)}
<body><main class="cq">
<div class="cq-top"><span class="muted small">Quote from <b style="color:var(--ink)">${esc(row.business_name)}</b></span>
<button class="btn sm" onclick="window.print()">Download PDF</button></div>
${banners.join('')}
<article class="cq-doc">
  <header class="cq-head">
    <div>
      <div class="cq-biz">${esc(row.business_name)}</div>
      <div class="muted small">${esc(row.business_tagline || '')}${row.business_email ? ` · ${esc(row.business_email)}` : ''}</div>
      <h1>${esc(q.title)}</h1>
      <div class="muted">Prepared for <b style="color:var(--ink)">${esc(q.client_name)}</b>${q.client_company ? `, ${esc(q.client_company)}` : ''}</div>
    </div>
    <div class="cq-meta">
      <span class="pill ${esc(q.status)}" style="justify-self:end">${STATUS_LABEL[q.status] || esc(q.status)}</span>
      <span>Quote <b class="num">${esc(q.number)}</b></span>
      <span>Issued <b>${fmtDate(row.created_at)}</b></span>
      ${q.valid_until ? `<span>Valid until <b>${fmtDate(q.valid_until)}</b></span>` : ''}
      <span style="margin-top:8px">Total</span><b class="num" style="font-size:22px">${m(q.totals.total)}</b>
    </div>
  </header>
  ${accepted ? `<div class="accepted-box"><b>✓ Accepted by ${esc(q.accepted_by)}</b><span>${fmtDate(q.accepted_at)}</span></div>` : ''}
  <div class="cq-body">
    ${q.summary ? `<section><div class="cq-label">Overview</div><div class="cq-summary">${esc(q.summary)}</div></section>` : ''}
    <section><div class="cq-label">Scope &amp; pricing</div>
      <table class="items"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${items || '<tr><td colspan="4" class="muted">No items yet</td></tr>'}</tbody></table>
      <div class="totals" style="margin-top:18px">
        <div class="row"><span class="muted">Subtotal</span><span class="num">${m(q.totals.subtotal)}</span></div>
        ${q.totals.discount ? `<div class="row"><span class="muted">Discount</span><span class="num">− ${m(q.totals.discount)}</span></div>` : ''}
        ${q.tax_rate ? `<div class="row"><span class="muted">${esc(q.tax_label)} ${esc(q.tax_rate)}%</span><span class="num">${m(q.totals.tax)}</span></div>` : ''}
        <div class="row grand"><span>Total</span><span class="num">${m(q.totals.total)}</span></div>
      </div>
    </section>
    ${q.timeline ? `<section><div class="cq-label">Timeline</div><div class="pre">${esc(q.timeline)}</div></section>` : ''}
    ${q.terms ? `<section><div class="cq-label">Terms</div><div class="pre">${esc(q.terms)}</div></section>` : ''}
  </div>
  ${accepted ? '' : `<div class="cq-act">
    <form method="post" action="/q/${esc(q.slug)}/accept">
      <h3>Accept this quote</h3>
      <p class="small muted" style="margin:0">Type your full name to accept the scope, price and terms above.</p>
      <input name="name" placeholder="Your full name" required value="${esc(q.client_name)}">
      <button class="btn primary" type="submit">Accept quote · ${m(q.totals.total)}</button>
    </form>
    <form method="post" action="/q/${esc(q.slug)}/feedback">
      <h3>Need changes?</h3>
      <p class="small muted" style="margin:0">Tell ${esc(row.business_name)} what to change and they'll send a revised quote.</p>
      <textarea name="message" placeholder="e.g. Can we drop the pricing page and start next week?" required></textarea>
      <input type="hidden" name="name" value="${esc(q.client_name)}">
      <button class="btn" type="submit">Request changes</button>
    </form>
  </div>`}
</article>
<p class="powered">Sent with <a href="/">Kwote</a> · quotes written with Claude</p>
</main></body></html>`;
}

export function notFoundPage(msg = "This page doesn't exist, or the link has expired.") {
  return `${head('Not found · Kwote')}<body><div class="auth-wrap"><div class="auth">${logo}<h1>Hmm.</h1><p class="muted">${esc(msg)}</p><a class="btn" href="/">Go home</a></div></div></body></html>`;
}
