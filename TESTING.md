# EmbedEase — Testing & Verification Guide

This document defines manual and automated test criteria for each phase to guarantee stability and security before going live.

---

## Phase 1 Testing Checklist (Security, Migrations, Edge Functions, Core Bot)

- [ ] **Database Idempotency**: Run `supabase/migrations/` on a fresh or existing database schema without data loss or `DROP TABLE` conflicts.
- [ ] **RLS Integrity Test**:
  - Log in as User A. Attempt to read or edit User B's bots, leads, or profile via browser DevTools:
    ```javascript
    await supabase.from('profiles').update({ plan: 'enterprise', convos_limit: 999999 }).eq('id', myUserId);
    ```
    Must fail or be blocked by RLS / trigger.
- [ ] **Edge Function `/chat`**:
  - Send POST request with invalid `bot_id` → receives `404 Not Found`.
  - Exceed conversation limit → receives `429 Too Many Requests` with friendly upgrade notice.
  - Test valid message: receives AI response with citations/knowledge base matching.
  - Test language auto-detection: Hindi, English, Hinglish query response matching.
- [ ] **Edge Function `/lead`**:
  - Submit lead from anonymous visitor session → lead is recorded with full attribution (`utm_*`, `gclid`, `fbclid`, referrer, session_id).
- [ ] **Widget Security & Attribution**:
  - Test on local HTML page.
  - Check `window.EmbedEase.track(...)` fires.
  - Verify that script tag escapes all input (no XSS injection via welcome message or user input).
  - Verify "Continue on WhatsApp" button triggers correctly.
- [ ] **Razorpay Webhook & Order Creation**:
  - Generate test order via `/create-order`.
  - Simulate webhook event `order.paid` with valid HMAC SHA256 signature → user profile upgrades plan and resets conversation limits.
  - Simulate webhook with invalid signature → returns `400 Bad Request`.

---

## Phase 2 Testing Checklist (Tracking & Dashboard)

- [ ] **Attribution Pipeline**:
  - Visit test URL with `?utm_source=meta&utm_medium=cpc&utm_campaign=summer_sale&gclid=test1234`.
  - Open widget, trigger conversation, submit lead.
  - Check `leads` table and Performance tab in `app.html` to confirm CPL, CAC, and attribution channel are populated.
- [ ] **Performance Tab**:
  - Filters by date range and campaign work without JavaScript errors.
  - Currency displayed formatted in INR (`₹` / `en-IN`).
- [ ] **Leads Management**:
  - Kanban / Table view switching.
  - Stage changes (New → Contacted → Qualified → Won → Lost).
  - CSV export generates valid downloadable CSV.

---

## Phase 3 Testing Checklist (Marketing Website Redesign)

- [ ] **Aesthetics & Tone**:
  - Warm ivory `#F6F4EF`, ink `#0F1210`, deep green `#0E6B4D`, warm amber `#E0A526`.
  - Typography: Instrument Serif / Fraunces headings, Inter / DM Sans body.
  - Zero fake testimonials (replaced with Founding Partner Program).
  - Monochrome logo marquee with legal trademark disclaimer.
- [ ] **Responsive & Performance**:
  - Passes mobile responsiveness without horizontal scrolling.
  - Lighthouse performance & accessibility score verified.
  - Interactive WhatsApp Cost Calculator calculates Meta fee + platform tier + GST correctly.

---

## Phase 4 Testing Checklist (WhatsApp Marketing & Partner Program)

- [ ] **WhatsApp Webhook**:
  - Receives message delivery updates and computes per-message cost.
  - Handles STOP keyword for opt-out compliance.
- [ ] **Partner Program**:
  - Partner signup with `?ref=` attribution.
  - Partner view only shows their assigned clients and commissions.
  - Admin view (Shubham) shows global revenue, total usage, and commission payouts.
