# EmbedEase — Master Build Prompt (for Anti-Gravity)

Paste this whole file as the first message. Then say: "Start Phase 0, show me the plan, then proceed phase by phase. After every phase, tell me what to test."

---

## 0. ROLE & CONTEXT

You are a senior full-stack engineer + product designer. You are working inside an existing repo: **EmbedEase (embedease.in)** — a static Vanilla HTML/CSS/JS frontend on **Vercel**, backed by **Supabase** (Postgres + Auth + Edge Functions, project ref `rlzscyjegyorjpagguhc`). Razorpay for payments (INR).

Existing files: `index.html`, `app.html` (dashboard), `pricing.html`, `guide.html`, `widget-builder.html`, `widget.js` (embeddable chatbot), `supabase-setup.sql`, `add-columns.sql`.

Owner: **Shubham Shrivastava**, founder, **Roopya Technologies**. Footer/legal: `© 2026 Roopya Technologies. EmbedEase is a product of Roopya Technologies. Founder: Shubham Shrivastava.`

**Positioning:** EmbedEase is NOT an agency and NOT only a chatbot. It is a **one-stop growth & marketing platform for Indian businesses**: *"We are not an agency. We are your building partners."* Chatbot + lead capture + WhatsApp campaigns + performance marketing + AI video/creatives + full cost-per-lead / cost-per-conversion tracking.

Deadline: **2–3 days to go live.** Prefer working, deployed, secure over fancy. Keep stack as-is (no framework migration) unless I approve.

---

## 1. NON-NEGOTIABLE RULES (read first)

1. **No fake social proof.** The current `index.html` has invented testimonials (Rahul Sharma/ShopKart, Priya Mehta/PropVista, Arjun Kapoor/DigiNest) and claims like "trusted by businesses across India", "leads increased 3x". **Delete them.** Replace with: a real "Founding Partner Program" CTA, real numbers pulled live from the DB only if they exist, and placeholders marked `<!-- TODO: real testimonial -->` that do NOT render until filled.
2. **No unverifiable claims.** Don't write "5+ years of experience" or specific % results anywhere unless I supply proof. Use: "Hands-on experience across Meta Ads, Google Ads, Hotstar Ads, WhatsApp Cloud API, n8n automation." Pricing claims must match what is technically true (see §7).
3. **Third-party logos** (Google, Meta, WhatsApp, Hotstar, Truecaller, YouTube, Instagram…): show as "Platforms we run campaigns on" with grey monochrome logos + footer note: *"All logos are trademarks of their respective owners. No affiliation or endorsement implied."* Never say "official partner" unless I confirm.
4. **Security first** (see §6). Do not ship until the Phase 1 security checklist passes.
5. Never commit secrets. Supabase anon key in frontend is OK; service-role key, Razorpay secret, WhatsApp token, AI provider keys live ONLY in Supabase Edge Function secrets.
6. After each phase: list files changed, how to test, and what's still broken. Do not claim "done" without running something.

---

## 2. KNOWN PROBLEMS IN CURRENT CODE (fix in Phase 1)

- **Edge functions `chat`, `lead`, `train` are called by `widget.js`/`app.html` but are NOT in the repo.** Create them in `supabase/functions/` (Deno/TypeScript) so the whole thing is reproducible and deployable.
- **RLS gap:** `payments_insert` and `profiles_update` let a logged-in user write their own plan/payment rows from the browser → anyone can self-upgrade to a paid plan from DevTools. Remove client-side plan updates; plan changes only via a **Razorpay webhook edge function** (verify signature, then update `profiles` with service role). Lock `profiles.plan, plan_status, convos_limit, convos_used, razorpay_id` from client updates (column-level privileges or a trigger).
- **Anonymous widget visitors** cannot insert into `leads`/`conversations` under current RLS → all widget writes must go through edge functions using the service role, which validate `bot_id`, rate-limit, and enforce the owner's plan limits.
- `supabase-setup.sql` starts with `DROP TABLE ... CASCADE` — dangerous. Replace with idempotent migrations in `supabase/migrations/` (`CREATE TABLE IF NOT EXISTS`, `ALTER ... IF NOT EXISTS`). Never drop in production.
- Widget `BASE` URL is hardcoded; make it configurable via `data-api` with default.
- Add CORS properly on edge functions (allow any origin for `/chat` and `/lead` since widget is embedded on customer sites, but validate `bot_id` and optionally the bot's allowed-domains list).

---

## 3. PRODUCT SCOPE (what the platform does)

### 3.1 AI Chatbot (core, must work end-to-end)
- User signs up → creates bot (name, emoji, colour, welcome message, system prompt, knowledge base text / URL / PDF) → copies one `<script>` tag → pastes on their site → bot answers **from their knowledge base**, in Hindi / English / Hinglish (auto-detect visitor language).
- `/chat` edge function: loads bot config + knowledge base, calls the AI provider (Claude by default; provider selectable per bot via `ai_provider`), streams reply, stores conversation, increments usage, **blocks when plan limit reached** with a friendly message.
- Knowledge: paste text, add website URL (crawl a few pages), upload PDF/FAQ. Chunk + embed with pgvector for retrieval (RAG). Show "Training status" in dashboard (`training_status`, `trained_at`). Answers must say "I don't know, here's how to contact the team" instead of hallucinating.
- Suggested questions auto-generated from knowledge base.
- Human handoff: "Talk to a human" button → captures contact, notifies owner (email + WhatsApp).
- Lead capture: configurable trigger (after N messages / on intent like price/demo/call-back), fields (name, phone, email), consent checkbox, saved to `leads` with full attribution (see §4).

### 3.2 WhatsApp Marketing & Automation
- Connect WhatsApp Cloud API (Meta) number per account (embedded signup or manual token entry).
- Template manager: create/submit/approve status for templates (marketing / utility / authentication).
- **Campaigns:** upload CSV or pick leads segment → choose template → schedule → send in batches respecting Meta rate limits → live delivery stats (sent / delivered / read / replied / failed).
- Webhook edge function `/wa-webhook`: receives message statuses and replies; **status webhooks contain pricing category & billable flag → use these to compute real cost per message**, store in `wa_messages`.
- Opt-in / opt-out (STOP) handling and a consent log — mandatory for compliance.
- Auto-reply flows (n8n-style simple builder): keyword → reply, lead qualification questions, push qualified leads into `leads`.
- Click-to-WhatsApp: generate `wa.me` links / QR with UTM-like `ref` codes so chats from Meta/Google ads are attributed to campaigns.
- Website bot → "Continue on WhatsApp" button.

### 3.3 Performance Marketing Hub (we are building partners)
- Per-client **Campaign** object: channel (Meta, Google Ads, Hotstar, WhatsApp, YouTube, Organic, Referral), objective, budget, dates, UTM set.
- Manual spend entry + CSV import now; Meta Marketing API / Google Ads API sync in a later phase (design the table for it).
- **Google Ads app-install tracking help:** a guide + checklist page for app-install campaigns (Firebase/GA4 → Google Ads conversion import, install vs in-app event optimisation, MMP basics, Play Install Referrer / `gclid` handling). Content only for now.
- Creative library: upload/store banners, videos; tag by campaign.

### 3.4 AI Video & Creative Generation (v1 = lightweight)
- Input: product, offer, language, aspect ratio, tone → output: script + hook variants + captions + 3 banner copy variants (via LLM). Video generation: integrate one provider behind a single `generate_video` edge function (provider key in secrets); if no key is configured, UI shows "Request video via our team" (creates a ticket). Do not fake generated output.

### 3.5 Partner / Reseller Program ("I want to become a marketing partner; my network is under me")
- Multi-level structure: **Owner (Shubham/Roopya) → Partners → Clients**. A partner can onboard clients, see only their clients' dashboards, earn commission (% of client's subscription + optional campaign margin).
- Tables: `partners`, `partner_clients`, `commissions`. Partner dashboard: clients list, MRR, commissions pending/paid, referral link, white-label option (logo + colour + custom domain later).
- Referral attribution via cookie + `?ref=` code at signup.
- Admin panel (only my email via `is_admin` flag): all users, bots, usage, payments, partner payouts.

---

## 4. TRACKING: EVERY LEAD, EVERY RUPEE (the core differentiator)

Goal: for every client, answer **"how much did each lead / conversation / sale cost, from which channel and campaign?"**

### 4.1 Widget attribution (widget.js)
On load, capture and send with every `/chat` and `/lead` call:
`session_id` (first-party, persisted), `visitor_id`, `page_url`, `referrer`, `utm_source/medium/campaign/content/term`, `gclid`, `fbclid`, `ctwa_clid` (if present), `device`, `language`, `first_touch` vs `last_touch` (store both from localStorage; wrap in try/catch).
Also fire events: `widget_loaded`, `widget_opened`, `message_sent`, `lead_form_shown`, `lead_submitted`, `handoff_requested`, `whatsapp_clicked`, `conversion` (callable by site via `window.EmbedEase.track('purchase', {value: 1999})`).

### 4.2 Schema (new migrations — extend, don't break existing)
- `leads`: add `campaign_id`, `channel`, `utm_*`, `gclid`, `fbclid`, `first_touch jsonb`, `last_touch jsonb`, `session_id`, `consent boolean`, `consent_at`, `stage` (new → contacted → qualified → won → lost), `deal_value numeric`, `won_at`, `lost_reason`, `assigned_to`.
- `campaigns(id, user_id, name, channel, objective, budget, start/end, utm_campaign, status)`
- `ad_spend(id, campaign_id, date, spend, impressions, clicks, source: manual|csv|api)`
- `events(id, bot_id, session_id, lead_id, name, props jsonb, page_url, created_at)`
- `wa_messages(id, user_id, campaign_id, lead_id, wa_message_id, direction, category, status, billable, cost numeric, ts)`
- `usage_costs(id, user_id, kind: ai_tokens|wa_message|video, units, cost, ts)` — so I know my own platform cost per client.
- Add all with RLS = owner-only (and partner read-through for their clients). Indexes on `(user_id, created_at)`.

### 4.3 Metrics dashboard (app.html → "Performance" tab)
Date range + campaign + channel filters. Show:
- Spend, Impressions, Clicks, CTR, CPC
- Conversations, Leads, **Cost per Conversation, Cost per Lead (CPL)**, Qualified leads, **Cost per Qualified Lead**
- Won deals, Revenue, **CAC, ROAS, ROI**
- WhatsApp: sent/delivered/read/reply rate, **cost per message & per reply**
- Funnel: visitors → widget opens → conversations → leads → qualified → won
- Table: per campaign and per channel P&L; per-lead timeline (first touch → every message → deal).
- Export CSV. Weekly email/WhatsApp report to owner.
Use Chart.js (already used). Currency INR formatting (en-IN).

### 4.4 Leads dashboard
Kanban + table view, filters, search, status change, notes, tags, call/WhatsApp buttons, "Lead source & cost" column, instant notification (email + WhatsApp) on new lead, duplicate detection by phone/email, auto lead score from conversation (LLM-based intent score 0–100 with one-line reason).

---

## 5. PLANS & BILLING
- Keep plans from `pricing.html`, but read actual prices/limits from one config (`plans` table or `config.js`) so UI and enforcement can't drift.
- Razorpay: create order via edge function → checkout → **webhook** verifies signature → writes `payments` + updates `profiles`. Handle failure, refund, subscription cancel, GST invoice number (store GSTIN optional).
- Usage metering: conversations, WhatsApp messages, video credits. Warn at 80%, block at 100% with upgrade CTA.

---

## 6. SECURITY & COMPLIANCE CHECKLIST (gate for launch)
- RLS on every table, tested with two users (user A must not read user B).
- No privilege escalation via client updates (see §2).
- Edge functions: input validation (zod), rate limit per IP + per bot, max message length, prompt-injection guard (system prompt cannot be overridden by visitor; never reveal system prompt / keys), HTML-escape all rendered output in widget (no `innerHTML` with user/AI text without sanitising).
- Razorpay & WhatsApp webhooks verify signatures.
- Privacy Policy, Terms, Refund Policy, Data Deletion page; cookie/consent notice; DPDP Act 2023-aware consent wording on lead form; WhatsApp opt-in logging.
- Security headers via `vercel.json` (CSP, X-Content-Type-Options, Referrer-Policy), clean URLs, 404 page, `sitemap.xml`, `robots.txt`.
- Error monitoring (Sentry free tier or Supabase logs) + uptime check.

---

## 7. PRICING CLAIM — READ CAREFULLY
I want to market: *"WhatsApp campaigns from ₹0.80 down to ₹0.18 per message."*
Reality: Meta's official per-message fee depends on category (marketing is highest; utility/authentication/service lower, with volume tiers) and changes periodically (India marketing rate changed 1 Jan 2026). **Do not hard-code "18 paise" as a marketing-message price.** Implement a **live cost calculator** on the site where the visitor picks message category + volume, using a `wa_rates` table I can update from Meta's current India rate card, plus our platform fee. Hero line must be defensible, e.g. *"WhatsApp campaigns at Meta's lowest rates — with every paisa tracked per lead."* Show the formula (Meta fee + our fee + GST). If I later confirm we truly achieve ~₹0.18 on a specific category/volume, I will tell you and you'll add a labelled row for exactly that.

---

## 8. WEBSITE (marketing site) — STRUCTURE & COPY

### 8.1 Design direction (IMPORTANT)
- **NO blue gradients. NO purple/neon AI look. NO emoji-as-icons. NO stock-template feel.** Must look like a serious, professional growth company.
- Palette: warm ivory `#F6F4EF` background, ink `#0F1210` text, one confident accent **deep green `#0E6B4D`** (WhatsApp-adjacent but muted) with a secondary warm amber `#E0A526` used sparingly for highlights/numbers. Dark sections in `#0F1210`. Flat colour, subtle 1px borders, generous whitespace, no glassmorphism, no gradient backgrounds (a very subtle noise/grain texture is allowed).
- Type: headings **"Instrument Serif"** or **"Fraunces"** (editorial, confident); body **"Inter"** or **"DM Sans"**; numbers in tabular figures. Max 2 families. Large type, tight line-height, real hierarchy.
- Layout: 12-col grid, max-width 1200px, section rhythm 96–120px. Sticky slim nav with "Book a call" + "Start free".
- Motion: tasteful. Logo marquee, number count-ups, scroll-reveal (IntersectionObserver), hover states. Respect `prefers-reduced-motion`.
- Fully responsive, Lighthouse ≥ 90 mobile, semantic HTML, alt text, focus states, WCAG AA contrast.
- Icons: consistent line-icon set (Lucide via CDN with pinned version) — not emoji.
- Hindi/English toggle for key sections (Hinglish microcopy OK in CTAs).

### 8.2 Moving logo marquee ("Platforms we run & integrate")
Two infinite CSS-marquee rows moving in opposite directions, pause on hover, grayscale → colour on hover, edge fade masks. Logos: **Google Ads, Meta (Facebook/Instagram), WhatsApp, Hotstar (JioHotstar), YouTube, Truecaller, Google Analytics, Firebase, Razorpay, Supabase, n8n, Zapier, Shopify, WooCommerce**. Load from Simple Icons CDN (`https://cdn.simpleicons.org/<slug>/<hex>`); if a logo is missing (e.g. Hotstar, Truecaller), use a neat text wordmark in the same style — never a broken image. Include the trademark disclaimer from §1.3.

### 8.3 Page sections (index.html)
1. **Nav:** Logo · Platform · WhatsApp · Performance · Video · Partners · Pricing · Guide · Login · Start free
2. **Hero:** H1 e.g. *"Marketing that shows you the cost of every lead."* Sub: *"Chatbot, WhatsApp campaigns, performance marketing and AI video — in one platform. Built by operators, not an agency."* CTAs: Start free · Book a strategy call. Right side: a real-looking **product UI mock** (dashboard with CPL/ROAS) built in HTML/CSS — not an illustration.
3. **Logo marquee** (8.2)
4. **"We are not an agency. We are your building partners."** — 3 columns: We build it with you · You own the data & accounts · You see every rupee.
5. **What EmbedEase can do** (feature grid, with icons):
   - AI chatbot on your site in 10 minutes (no code, Hindi/English/Hinglish, trained on your content)
   - Lead capture + instant alerts + lead scoring
   - WhatsApp campaigns & automation (templates, broadcasts, auto-replies, click-to-WhatsApp, opt-in compliance)
   - Cost-per-lead / CAC / ROAS tracking across every channel
   - Performance marketing: Meta Ads, Google Ads (incl. **app-install campaigns**), Hotstar Ads — strategy, setup, optimisation
   - AI creatives & video: scripts, banners, short videos
   - n8n / Zapier / webhook automations & CRM integrations
   - Analytics & reporting dashboards (Power BI/Looker-style)
   - Product testing / e-commerce QA & UX flows (Figma wireframes) — from founder's e-commerce launch experience
6. **How it works** (4 steps, numbered): Connect → Train → Launch → Track.
7. **Cost tracking showcase** — interactive demo dashboard with sample data clearly labelled "Sample data".
8. **WhatsApp cost calculator** (§7).
9. **Services & engagement** — "Done-with-you" packages: Starter / Growth / Partner. (Pricing numbers from config; CTA = book call.)
10. **Partner program** — "Become a marketing partner. Build your own network under your brand." How it works, commission model, CTA.
11. **Founder section (brand, not a resume):** Shubham Shrivastava — Founder, Roopya Technologies. Short honest bio: hands-on with Meta/Google/Hotstar Ads, WhatsApp Cloud API + n8n automation, built EmbedEase end-to-end, e-commerce launch QA, data/analytics (Power BI, SQL, Python). Link LinkedIn. **Do not state years of experience unless I give a number I'm comfortable proving.** Keep it ~80 words.
12. **FAQ** (8–10 Qs: data ownership, WhatsApp approval, pricing, refunds, how fast, support).
13. **Final CTA band** + **Contact form** (name, phone, business, what you need) → saves to `leads` table as an EmbedEase-internal lead and pings me on WhatsApp/email.
14. **Footer:** product links, legal pages, `© 2026 Roopya Technologies`, GST/CIN placeholders, trademark disclaimer, contact: shubhamshri.1011@gmail.com, +91-9425625642, Bhopal / Pune.

Also build/refresh: `/whatsapp`, `/performance`, `/video`, `/partners`, `/pricing`, `/guide` (+ Google Ads app-install guide), `/privacy`, `/terms`, `/refund`, `/contact`.

### 8.4 SEO / analytics (dogfood our own product)
Meta tags, OG images, JSON-LD (Organization, SoftwareApplication, FAQ), GA4 + Meta Pixel + Google Ads tag with consent mode, **our own widget installed on our own site** with UTM attribution flowing into our own dashboard.

---

## 9. PHASED PLAN (2–3 days) — work in this order

**Phase 0 (30 min):** Read the repo, confirm understanding, output a short plan + list of questions/assumptions. Create `README.md` with architecture + env/secrets list.

**Phase 1 — Make it LIVE and secure (Day 1):**
1. `supabase/migrations/*` (idempotent) for existing + new tables; RLS fixes (§2); remove DROP TABLE.
2. Edge functions: `chat`, `lead`, `train`, `razorpay-webhook`, `create-order`. Local test via `supabase functions serve`; deploy commands documented.
3. `widget.js`: attribution capture, sanitised rendering, events, `data-api`, language detect, Continue-on-WhatsApp, `window.EmbedEase.track`.
4. `vercel.json` (headers, clean URLs), deploy to Vercel, connect `embedease.in`.
5. End-to-end test: signup → create bot → train → embed on a test HTML page → chat works → lead appears in dashboard with source + UTM → usage increments → payment test-mode upgrades plan via webhook.
**Exit gate:** §6 security checklist passes.

**Phase 2 — Tracking & dashboard (Day 2):** campaigns, ad_spend, events, Performance tab, Leads kanban, notifications, CSV export, cost calculator data model.

**Phase 3 — New marketing website (Day 2–3, can run in parallel):** redesign per §8 (palette, type, marquee, sections, all pages, legal, SEO).

**Phase 4 — WhatsApp + Partners (Day 3):** Cloud API connect, templates, campaign sender, webhook costs, opt-in logs; partner tables + dashboard + referral attribution; admin panel.

**Phase 5 (post-launch backlog):** Meta/Google Ads API spend sync, video provider integration, white-label domains, WhatsApp flow builder v2, mobile app-install attribution.

If time runs short, cut in this order: video → white-label → flow builder → admin polish. **Never cut:** security, tracking, working chatbot, honest copy.

---

## 10. DELIVERABLES & OUTPUT FORMAT
- Working code in repo, small commits per task.
- `README.md`: setup, secrets list, deploy steps, test script.
- `TESTING.md`: manual test checklist per phase.
- At the end of each phase: summary (≤10 lines): done / not done / what I must do manually (e.g. add secrets, verify Meta Business, set Razorpay webhook URL).

## 11. THINGS I (OWNER) WILL PROVIDE / DO
Meta Business verification + WhatsApp number, Razorpay live keys, AI provider key, GA4/Pixel IDs, GST/CIN details, logo files, real testimonials when available. Ask me for any of these only when a phase is blocked by it; otherwise stub with env vars and clear TODOs.

Begin with Phase 0.
