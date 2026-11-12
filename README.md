# Kwote

Your Claude writes the quote. Kwote gets it accepted.

Kwote is a quoting tool for freelancers and small agencies. It runs on the customer's own Claude through MCP. Claude reads the brief and writes the quote. Kwote saves it, does the maths (tax and discounts), hosts a live client link where the client can accept or ask for changes, and tracks views and responses.

**There is no AI inside Kwote**: no OpenAI or Anthropic keys, no model calls.

## Try it live
- **App:** https://kwote-pikuuuuuus-projects.vercel.app
- **Test login:** `demo@kwote.app` / `demo1234`
- **MCP link:** `https://kwote-pikuuuuuus-projects.vercel.app/mcp/kw_demo_4QmZ8vT2xLp`
- **Docs:** [strategy](docs/Kwote_Strategy_Piyush_Oram.pdf) · [architecture & notes](docs/Kwote_Architecture_Notes_Piyush_Oram.pdf)

The live demo runs on embedded Postgres (PGlite), so its data can reset to the sample state whenever the server restarts. Set `DATABASE_URL` to use a hosted Postgres.

## Stack
- Node 20+, Express 5
- Postgres (Neon on Vercel, or Render Postgres). Without `DATABASE_URL`, it falls back to an embedded Postgres (PGlite) for local development.
- MCP: `@modelcontextprotocol/sdk`, Streamable HTTP, stateless, at `/mcp/<private-key>`

## Run locally
```bash
npm install
npm run dev          # http://localhost:3000
```
Demo login: `demo@kwote.app` / `demo1234`. Demo MCP link: `http://localhost:3000/mcp/kw_demo_4QmZ8vT2xLp`

## Deploy to Vercel + Neon (free, no cold starts)
1. Push this folder to a new GitHub repo.
2. In vercel.com, go to **Add New → Project**, import the repo and click **Deploy**. No build settings are needed.
3. In the project, go to **Storage → Create Database → Neon (Postgres)**, then click **Connect to project**. This adds `DATABASE_URL`.
4. Under **Settings → Environment Variables**, add `SESSION_SECRET` with any long random string.
5. Go to **Deployments → ⋯ → Redeploy**.
6. Open `https://<your-app>.vercel.app/health`. It should return `{"ok":true}`. The tables and demo account are created on the first request.

### Or deploy to Render (one click, but sleeps when idle)
Go to **New → Blueprint** and pick the repo. `render.yaml` creates the web service and a free Postgres database. The free plan sleeps after 15 minutes idle, so open the site once before a demo.

## Connect to Claude
1. Log in to Kwote, then open **Connect Claude** and copy your MCP link.
2. In Claude, go to **Settings → Connectors → Add custom connector**, name it `Kwote`, paste the link and click **Add**.
3. In a chat, turn Kwote on from the tools menu and ask: *"Use Kwote to draft a quote for Priya at Saffron Foods: a logo and an Instagram kit, delivered in 3 weeks."*

## MCP tools
| Tool | What it does |
|---|---|
| `get_business_profile` | Rate card, currency, tax and default terms |
| `create_quote` | Saves a draft quote and returns the edit link and client link |
| `list_quotes` | Status, totals, views and client feedback |
| `get_quote` | Full quote with activity history |
| `update_quote` | Changes fields or status |
| `update_business_profile` | Updates the rate card and defaults |
