(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STATUS = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', changes_requested: 'Changes requested', accepted: 'Accepted', declined: 'Declined' };
  let me = null;
  let pollTimer = null;
  let seenIds = null;

  const money = (n, cur = 'INR') => {
    try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: Number.isInteger(Math.round((n || 0) * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 }).format(n || 0); }
    catch { return `${cur} ${Number(n || 0).toFixed(2)}`; }
  };
  const ago = (d) => {
    if (!d) return '';
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  const pill = (s) => `<span class="pill ${esc(s)}">${STATUS[s] || esc(s)}</span>`;
  const claudeTag = (q) => (q.created_via === 'claude' ? `<span class="tag-claude">✳ by Claude</span>` : '');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    if (res.status === 401) { location.href = '/login'; throw new Error('auth'); }
    if (res.status === 204) return null;
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch { prompt('Copy this:', text); }
  }
  window.__copy = copy;

  function setNav(name) {
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === name));
  }

  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }

  // ---------------- Quotes list ----------------
  async function renderList() {
    setNav('quotes');
    const quotes = await api('/api/quotes');
    const known = seenIds;
    seenIds = new Set(quotes.map((q) => q.id));
    const cur = me.profile.currency || 'INR';
    const open = quotes.filter((q) => ['draft', 'sent', 'viewed', 'changes_requested'].includes(q.status));
    const won = quotes.filter((q) => q.status === 'accepted');
    const decided = quotes.filter((q) => ['accepted', 'declined'].includes(q.status));
    const attention = quotes.filter((q) => q.status === 'changes_requested').length;
    const sum = (arr) => arr.reduce((s, q) => s + q.totals.total, 0);

    view.innerHTML = `
      <div class="page-head">
        <div><h1>Quotes</h1><p>Ask Claude to draft a quote. It will show up here on its own. <span class="live">Live</span></p></div>
        <div style="display:flex;gap:8px"><a class="btn" href="#/connect">Connect Claude</a><button class="btn primary" id="new-q">New quote</button></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="k">Open pipeline</div><div class="v num">${money(sum(open), cur)}</div></div>
        <div class="stat"><div class="k">Won</div><div class="v num">${money(sum(won), cur)}</div></div>
        <div class="stat"><div class="k">Win rate</div><div class="v num">${decided.length ? Math.round((won.length / decided.length) * 100) + '%' : '—'}</div></div>
        <div class="stat"><div class="k">Needs your attention</div><div class="v num">${attention}</div></div>
      </div>
      ${quotes.length ? `<div class="table">
        <div class="trow th"><div>Quote</div><div>Status</div><div class="r">Total</div><div class="r">Views</div><div class="r">Updated</div></div>
        ${quotes.map((q) => `<a class="trow ${known && !known.has(q.id) ? 'new' : ''}" href="#/quote/${q.id}">
          <div><div class="t">${esc(q.title)} ${claudeTag(q)}</div>
            <div class="c"><span class="num">${esc(q.number)}</span> · ${esc([q.client_name, q.client_company].filter(Boolean).join(', ') || 'No client yet')}</div>
            ${q.status === 'changes_requested' && q.client_feedback ? `<div class="fb">“${esc(q.client_feedback.slice(0, 110))}”</div>` : ''}</div>
          <div>${pill(q.status)}</div>
          <div class="r num">${money(q.totals.total, q.currency)}</div>
          <div class="r num">${q.views}</div>
          <div class="r small muted">${ago(q.updated_at)}</div>
        </a>`).join('')}
      </div>` : `<div class="table"><div class="empty"><h3>No quotes yet</h3><p>Connect Claude, then ask it: “Draft a quote for a 5-page website for Acme Corp.”</p><a class="btn primary" href="#/connect">Connect Claude</a></div></div>`}
    `;
    $('#new-q').onclick = async () => {
      const q = await api('/api/quotes', { method: 'POST', body: { title: 'New quote', line_items: [{ name: 'Service', qty: 1, unit_price: 0 }] } });
      location.hash = `#/quote/${q.id}`;
    };
    if (known) {
      const fresh = quotes.find((q) => !known.has(q.id));
      if (fresh) toast(`New quote: ${fresh.title}`);
    }
  }

  // ---------------- Editor ----------------
  let edState = null;

  function itemsHtml(items, cur) {
    return `<div class="item-row head"><div>Item</div><div>Qty</div><div>Unit</div><div>Rate</div><div style="text-align:right">Amount</div><div></div></div>
      ${items.map((it, i) => `<div class="item-row" data-i="${i}">
        <input data-k="name" value="${esc(it.name)}" placeholder="Item">
        <input data-k="qty" type="number" step="any" value="${esc(it.qty)}">
        <input data-k="unit" value="${esc(it.unit)}" placeholder="unit">
        <input data-k="unit_price" type="number" step="any" value="${esc(it.unit_price)}">
        <div class="amt">${money(it.qty * it.unit_price, cur)}</div>
        <button class="x" data-del="${i}" title="Remove">×</button>
        <input class="desc" data-k="description" value="${esc(it.description)}" placeholder="What's included (optional)">
      </div>`).join('')}`;
  }

  function localTotals(q) {
    const sub = q.line_items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
    const disc = Math.min(Math.max(Number(q.discount) || 0, 0), sub);
    const tax = ((sub - disc) * (Number(q.tax_rate) || 0)) / 100;
    return { subtotal: sub, discount: disc, tax, total: sub - disc + tax };
  }

  function sideHtml(q) {
    const t = localTotals(q);
    const cur = q.currency;
    return `
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">${pill(q.status)}<span class="save-state" id="save-state">All changes saved</span></div>
        <div class="sum">
          <div class="row"><span class="muted">Subtotal</span><span class="num">${money(t.subtotal, cur)}</span></div>
          ${t.discount ? `<div class="row"><span class="muted">Discount</span><span class="num">− ${money(t.discount, cur)}</span></div>` : ''}
          <div class="row"><span class="muted">${esc(q.tax_label)} ${esc(q.tax_rate)}%</span><span class="num">${money(t.tax, cur)}</span></div>
          <div class="row grand"><span>Total</span><span class="num">${money(t.total, cur)}</span></div>
        </div>
      </div>
      ${q.status === 'changes_requested' && q.client_feedback ? `<div class="panel" style="padding:0;border:none"><div class="callout warn"><b>Client asked for changes</b><br>“${esc(q.client_feedback)}”<br><span class="small">Tip: ask Claude to “revise ${esc(q.number)} based on the client's feedback”.</span></div></div>` : ''}
      ${q.status === 'accepted' ? `<div class="panel" style="padding:0;border:none"><div class="callout ok"><b>✓ Accepted by ${esc(q.accepted_by)}</b><br><span class="small">${new Date(q.accepted_at).toLocaleString('en-IN')}</span></div></div>` : ''}
      <div class="panel">
        <h2>Client link</h2>
        <div class="linkbox"><input readonly value="${esc(q.client_link)}"><button class="btn sm" onclick="__copy('${esc(q.client_link)}')">Copy</button></div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <a class="btn sm" href="/q/${esc(q.slug)}" target="_blank">Preview</a>
          ${['draft'].includes(q.status) ? `<button class="btn sm primary" id="mark-sent">Mark as sent</button>` : ''}
        </div>
        <p class="small muted" style="margin:10px 0 0">${q.views} client view${q.views === 1 ? '' : 's'}${q.last_viewed_at ? ` · last ${ago(q.last_viewed_at)}` : ''}</p>
      </div>
      <div class="panel">
        <h2>Status</h2>
        <select id="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === q.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div class="panel">
        <h2>Activity</h2>
        <div class="feed">${(q.activity || []).map((e) => `<div class="ev ${esc(e.type)}"><span class="dot"></span><div>${esc(e.detail || e.type)}<div class="when">${ago(e.created_at)}</div></div></div>`).join('') || '<span class="muted">No activity yet</span>'}</div>
      </div>
      <button class="btn danger ghost sm" id="del-q">Delete quote</button>`;
  }

  async function renderEditor(id) {
    setNav('quotes');
    const q = await api(`/api/quotes/${id}`);
    edState = { q, dirty: false, saving: false, timer: null };
    view.innerHTML = `
      <a class="back" href="#/">← All quotes</a>
      <div class="ed">
        <div>
          <div class="panel">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px">
              <span class="small muted num">${esc(q.number)} ${claudeTag(q)}</span>
            </div>
            <input class="title-input" data-f="title" value="${esc(q.title)}">
            <div class="grid3" style="margin-top:14px">
              <label class="field"><span>Client name</span><input data-f="client_name" value="${esc(q.client_name)}"></label>
              <label class="field"><span>Company</span><input data-f="client_company" value="${esc(q.client_company)}"></label>
              <label class="field"><span>Client email</span><input data-f="client_email" value="${esc(q.client_email)}"></label>
            </div>
          </div>
          <div class="panel">
            <h2>Overview</h2>
            <textarea data-f="summary" rows="4" placeholder="What the client is getting and why">${esc(q.summary)}</textarea>
          </div>
          <div class="panel">
            <h2>Scope &amp; pricing</h2>
            <div class="items-ed" id="items">${itemsHtml(q.line_items, q.currency)}</div>
            <button class="btn sm" id="add-item" style="margin-top:12px">+ Add item</button>
            <div class="grid3" style="margin-top:18px">
              <label class="field"><span>Discount (${esc(q.currency)})</span><input data-f="discount" type="number" step="any" value="${esc(q.totals.discount)}"></label>
              <label class="field"><span>Tax %</span><input data-f="tax_rate" type="number" step="any" value="${esc(q.tax_rate)}"></label>
              <label class="field"><span>Currency</span><input data-f="currency" value="${esc(q.currency)}" maxlength="3"></label>
            </div>
          </div>
          <div class="panel">
            <div class="grid2">
              <label class="field"><span>Timeline</span><textarea data-f="timeline" rows="5">${esc(q.timeline)}</textarea></label>
              <label class="field"><span>Terms</span><textarea data-f="terms" rows="5">${esc(q.terms)}</textarea></label>
            </div>
            <label class="field" style="margin-top:14px;max-width:220px"><span>Valid until</span><input data-f="valid_until" type="date" value="${esc(q.valid_until || '')}"></label>
          </div>
        </div>
        <div id="side">${sideHtml(q)}</div>
      </div>`;
    bindEditor();
    stopPoll();
    pollTimer = setInterval(async () => {
      if (!edState || edState.dirty || edState.saving) return;
      const fresh = await api(`/api/quotes/${id}`).catch(() => null);
      if (!fresh || !edState) return;
      if (fresh.updated_at !== edState.q.updated_at || fresh.views !== edState.q.views || fresh.status !== edState.q.status) {
        const active = document.activeElement;
        if (active && active.closest && active.closest('.ed') && active.matches('input,textarea,select')) return;
        const contentChanged = fresh.updated_at !== edState.q.updated_at;
        if (contentChanged) { renderEditor(id); toast('Updated'); }
        else { edState.q = { ...edState.q, views: fresh.views, status: fresh.status, last_viewed_at: fresh.last_viewed_at, activity: fresh.activity, accepted_by: fresh.accepted_by, accepted_at: fresh.accepted_at, client_feedback: fresh.client_feedback }; refreshSide(); }
      }
    }, 4000);
  }

  function refreshSide() {
    $('#side').innerHTML = sideHtml(edState.q);
    bindSide();
  }

  function scheduleSave(patch) {
    Object.assign(edState.pending || (edState.pending = {}), patch);
    edState.dirty = true;
    const ss = $('#save-state'); if (ss) ss.textContent = 'Saving…';
    clearTimeout(edState.timer);
    edState.timer = setTimeout(flush, 600);
  }

  async function flush() {
    if (!edState || !edState.pending) return;
    const patch = edState.pending; edState.pending = null; edState.saving = true;
    try {
      const fresh = await api(`/api/quotes/${edState.q.id}`, { method: 'PUT', body: patch });
      edState.q = { ...edState.q, ...fresh, line_items: edState.q.line_items };
      if (!edState.pending) edState.dirty = false;
      refreshSide();
      const ss = $('#save-state'); if (ss) ss.textContent = 'All changes saved';
    } catch (e) {
      toast('Could not save: ' + e.message);
    } finally { edState.saving = false; }
  }

  function bindSide() {
    const st = $('#status');
    if (st) st.onchange = () => { edState.q.status = st.value; scheduleSave({ status: st.value }); };
    const ms = $('#mark-sent');
    if (ms) ms.onclick = () => { edState.q.status = 'sent'; scheduleSave({ status: 'sent' }); copy(edState.q.client_link); };
    const del = $('#del-q');
    if (del) del.onclick = async () => {
      if (!confirm('Delete this quote? This cannot be undone.')) return;
      await api(`/api/quotes/${edState.q.id}`, { method: 'DELETE' });
      edState = null; location.hash = '#/';
    };
  }

  function bindEditor() {
    const q = edState.q;
    view.querySelectorAll('[data-f]').forEach((el) => {
      el.addEventListener('input', () => {
        const f = el.dataset.f;
        let v = el.value;
        if (f === 'discount' || f === 'tax_rate') v = Number(v) || 0;
        if (f === 'currency') v = v.toUpperCase();
        q[f] = v;
        if (f === 'discount') q.totals.discount = v;
        if (['discount', 'tax_rate', 'currency'].includes(f)) refreshSide();
        scheduleSave({ [f]: v });
      });
    });
    const itemsEl = $('#items');
    const saveItems = () => scheduleSave({ line_items: q.line_items });
    itemsEl.addEventListener('input', (e) => {
      const row = e.target.closest('.item-row'); if (!row || !e.target.dataset.k) return;
      const i = Number(row.dataset.i); const k = e.target.dataset.k;
      q.line_items[i][k] = k === 'qty' || k === 'unit_price' ? Number(e.target.value) || 0 : e.target.value;
      row.querySelector('.amt').textContent = money(q.line_items[i].qty * q.line_items[i].unit_price, q.currency);
      refreshSide(); saveItems();
    });
    itemsEl.addEventListener('click', (e) => {
      const d = e.target.dataset.del; if (d === undefined) return;
      q.line_items.splice(Number(d), 1);
      itemsEl.innerHTML = itemsHtml(q.line_items, q.currency); refreshSide(); saveItems();
    });
    $('#add-item').onclick = () => {
      q.line_items.push({ name: '', description: '', qty: 1, unit: '', unit_price: 0 });
      itemsEl.innerHTML = itemsHtml(q.line_items, q.currency);
      itemsEl.querySelector('.item-row:last-child input').focus();
      saveItems();
    };
    bindSide();
  }

  // ---------------- Connect ----------------
  function renderConnect() {
    setNav('connect');
    const prompts = [
      'Use Kwote. Draft a quote for Priya at Saffron Foods: a logo and a 10-template Instagram kit, delivered in 3 weeks.',
      'Here is a client email: [paste]. Turn it into a Kwote quote using my rate card.',
      'Which of my Kwote quotes have clients asked to change? Revise them based on the feedback.',
      'Summarise my Kwote pipeline: what is open, what was viewed and what was won this month?',
    ];
    view.innerHTML = `
      <div class="page-head"><div><h1>Connect Claude</h1><p>Add Kwote to Claude once. After that, any chat can create and update your quotes.</p></div></div>
      <div class="ed">
        <div>
          <div class="panel">
            <h2>Your private MCP link</h2>
            <div class="linkbox"><input readonly id="mcp" value="${esc(me.mcp_url)}"><button class="btn primary sm" onclick="__copy(document.getElementById('mcp').value)">Copy</button></div>
            <p class="small muted" style="margin:10px 0 0">Anyone with this link can create quotes in your account, so keep it private. If it leaks, you can reset it.</p>
          </div>
          <div class="panel">
            <h2>Add it to Claude (claude.ai or the desktop app)</h2>
            <ol class="steps">
              <li><div>Open <b>Settings → Connectors</b> in Claude.</div></li>
              <li><div>Click <b>Add custom connector</b>. Name it <b>Kwote</b>, paste your MCP link above into <b>Remote MCP server URL</b>, then click <b>Add</b>. No sign-in is needed.</div></li>
              <li><div>In a new chat, open the <b>+</b> / tools menu and make sure <b>Kwote</b> is turned on.</div></li>
              <li><div>Ask for a quote. When Claude asks for permission to use a Kwote tool, click <b>Allow</b>. The quote will appear on your dashboard within a few seconds.</div></li>
            </ol>
          </div>
          <div class="panel">
            <h2>Things to try</h2>
            <div class="stack">${prompts.map((p, i) => `<div class="prompt"><span>${esc(p)}</span><button class="btn sm" onclick="__copy(${esc(JSON.stringify(p))})">Copy</button></div>`).join('')}</div>
          </div>
        </div>
        <div>
          <div class="panel">
            <h2>What Claude can do in Kwote</h2>
            <div class="feed">
              <div class="ev created"><span class="dot"></span><div><b>get_business_profile</b><div class="when">Reads your rate card, tax and terms</div></div></div>
              <div class="ev created"><span class="dot"></span><div><b>create_quote</b><div class="when">Saves a new draft quote</div></div></div>
              <div class="ev created"><span class="dot"></span><div><b>list_quotes / get_quote</b><div class="when">Checks status, views and feedback</div></div></div>
              <div class="ev created"><span class="dot"></span><div><b>update_quote</b><div class="when">Revises lines, prices and terms</div></div></div>
              <div class="ev created"><span class="dot"></span><div><b>update_business_profile</b><div class="when">Updates your rates and defaults</div></div></div>
            </div>
          </div>
          <div class="panel">
            <h2>Reset link</h2>
            <p class="small muted" style="margin-top:0">This turns off the old link straight away. You'll need to update the connector in Claude afterwards.</p>
            <button class="btn sm danger" id="rotate">Reset MCP link</button>
          </div>
        </div>
      </div>`;
    $('#rotate').onclick = async () => {
      if (!confirm('Reset your MCP link? The old link stops working immediately.')) return;
      const r = await api('/api/mcp-key/rotate', { method: 'POST' });
      me.mcp_url = r.mcp_url; renderConnect(); toast('New link created');
    };
  }

  // ---------------- Settings ----------------
  function renderSettings() {
    setNav('settings');
    const p = me.profile;
    view.innerHTML = `
      <div class="page-head"><div><h1>Business &amp; rates</h1><p>Claude reads this before every quote, so your prices and terms stay the same every time.</p></div>
      <span class="save-state" id="ps">Saved</span></div>
      <div class="ed">
        <div>
          <div class="panel stack">
            <div class="grid2">
              <label class="field"><span>Business name</span><input data-p="business_name" value="${esc(p.business_name)}"></label>
              <label class="field"><span>Contact email</span><input data-p="business_email" value="${esc(p.business_email)}"></label>
            </div>
            <label class="field"><span>Tagline</span><input data-p="business_tagline" value="${esc(p.business_tagline)}" placeholder="e.g. Brand & web design · Bengaluru"></label>
            <div class="grid3">
              <label class="field"><span>Currency</span><input data-p="currency" value="${esc(p.currency)}" maxlength="3"></label>
              <label class="field"><span>Tax name</span><input data-p="tax_label" value="${esc(p.tax_label)}"></label>
              <label class="field"><span>Tax %</span><input data-p="tax_rate" type="number" step="any" value="${esc(p.tax_rate)}"></label>
            </div>
          </div>
          <div class="panel"><h2>Rate card</h2><textarea data-p="rate_card" rows="10" placeholder="One service per line, e.g.&#10;Logo design: ₹18,000&#10;Website page: ₹8,000 per page">${esc(p.rate_card)}</textarea></div>
          <div class="panel"><h2>Default terms</h2><textarea data-p="default_terms" rows="5">${esc(p.default_terms)}</textarea></div>
        </div>
        <div><div class="panel"><h2>Tip</h2><p class="small muted" style="margin:0">You can also update this from Claude, for example: “Add ‘Brand workshop: ₹20,000’ to my Kwote rate card.”</p></div></div>
      </div>`;
    let t = null; const pend = {};
    view.querySelectorAll('[data-p]').forEach((el) => el.addEventListener('input', () => {
      pend[el.dataset.p] = el.dataset.p === 'tax_rate' ? Number(el.value) || 0 : el.value;
      $('#ps').textContent = 'Saving…';
      clearTimeout(t);
      t = setTimeout(async () => {
        const body = { ...pend }; Object.keys(pend).forEach((k) => delete pend[k]);
        me.profile = await api('/api/profile', { method: 'PUT', body });
        $('#biz-name').textContent = me.profile.business_name;
        $('#ps').textContent = 'Saved';
      }, 600);
    }));
  }

  // ---------------- Router ----------------
  async function route() {
    if (edState && edState.pending) await flush();
    stopPoll(); edState = null;
    const h = location.hash.replace(/^#/, '') || '/';
    try {
      const m = h.match(/^\/quote\/(\d+)/);
      if (m) return await renderEditor(m[1]);
      if (h.startsWith('/connect')) return renderConnect();
      if (h.startsWith('/settings')) return renderSettings();
      await renderList();
      pollTimer = setInterval(() => { if (!document.hidden) renderList().catch(() => {}); }, 4000);
    } catch (e) {
      if (e.message !== 'auth') view.innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn" href="#/">Back to quotes</a></div>`;
    }
  }

  (async () => {
    me = await api('/api/me');
    $('#biz-name').textContent = me.profile.business_name;
    $('#me-email').textContent = me.email;
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', () => { if (edState && edState.pending) flush(); });
    route();
  })();
})();
