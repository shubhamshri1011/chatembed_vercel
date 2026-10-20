# EmbedEase (embedease.in)
**The One-Stop Growth & Marketing Platform for Indian Businesses**  
*"We are not an agency. We are your building partners."*

EmbedEase combines AI Chatbots, Lead Capture & Attribution, WhatsApp Marketing Automation, Performance Marketing Tracking, and Creative Generation to track every rupee spent down to cost-per-lead (CPL) and return on ad spend (ROAS).

---

## 🏛️ Architecture Overview

```
                                      ┌─────────────────────────────────────┐
                                      │         End-User Websites           │
                                      │  (Embedded widget.js with UTM tags) │
                                      └──────────────────┬──────────────────┘
                                                         │
                                        Events / Chat    │ Lead Submissions
                                                         ▼
┌─────────────────────────────────┐        ┌─────────────────────────────────────┐
│       EmbedEase Frontend        │        │        Supabase Edge Functions      │
│  - Landing (index.html)         │        │  - /chat: AI reply + usage check    │
│  - Dashboard (app.html)         ├───────►│  - /lead: Attribution + capture     │
│  - Pricing & Calc (pricing.html)│        │  - /train: Ingest & vectorize RAG   │
│  - Performance Hub              │        │  - /create-order: Razorpay checkout │
│  - Hosted on Vercel             │        │  - /razorpay-webhook: Verified sub  │
└────────────────┬────────────────┘        │  - /wa-webhook: Meta status & costs │
                 │                         └──────────────────┬──────────────────┘
                 │ Supabase Client                            │ Service Role Key
                 │ (Anon Key + RLS)                           ▼
                 │                         ┌─────────────────────────────────────┐
                 └────────────────────────►│        Supabase Database (PG)       │
                                           │  - profiles (locked against client) │
                                           │  - bots, leads, conversations       │
                                           │  - campaigns, ad_spend, events      │
                                           │  - wa_messages, usage_costs         │
                                           │  - partners, commissions            │
                                           └─────────────────────────────────────┘
```

---

## 🔑 Environment Variables & Secrets Reference

### 1. Client-Side (Frontend / Widget)
*Safe to expose in client code / HTML headers:*
| Variable / Setting | Target File(s) | Description |
|---|---|---|
| `SUPABASE_URL` | `app.html`, `widget.js` | Supabase Project URL (`https://rlzscyjegyorjpagguhc.supabase.co`) |
| `SUPABASE_ANON_KEY` | `app.html`, `widget.js` | Supabase Public Anonymous API Key |
| `RAZORPAY_KEY_ID` | `app.html`, `pricing.html` | Razorpay Key ID (`rzp_test_...` or `rzp_live_...`) |

### 2. Server-Side Secrets (Supabase Edge Functions Vault)
*CRITICAL: Never commit these to version control or expose in client scripts.*
| Secret Name | Edge Function(s) Using It | Purpose |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `chat`, `lead`, `train`, `razorpay-webhook`, `wa-webhook` | Admin privileges for RLS bypass (secure writes) |
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | `chat`, `train` | AI reasoning, embeddings, and chat generation |
| `RAZORPAY_KEY_SECRET` | `razorpay-webhook`, `create-order` | Verification of payment signatures & order creation |
| `WHATSAPP_CLOUD_API_TOKEN` | `wa-webhook`, broadcast sender | Meta Graph API bearer token for WhatsApp Cloud API |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | `wa-webhook` | Challenge verification token configured in Meta App |
| `WHATSAPP_PHONE_NUMBER_ID` | `wa-webhook`, broadcast sender | Meta Phone Number ID for sending WhatsApp messages |

---

## 🚀 Deployment Instructions

### Supabase Migrations & Functions
```bash
# Link to remote project
npx supabase link --project-ref rlzscyjegyorjpagguhc

# Push idempotent database migrations
npx supabase db push

# Deploy edge functions
npx supabase functions deploy chat --no-verify-jwt
npx supabase functions deploy lead --no-verify-jwt
npx supabase functions deploy train
npx supabase functions deploy create-order
npx supabase functions deploy razorpay-webhook --no-verify-jwt
npx supabase functions deploy wa-webhook --no-verify-jwt
```

### Vercel Deployment
1. Connect repository or run `vercel --prod`.
2. Configure custom domain `embedease.in`.
3. Verify security headers via `vercel.json`.

---

## 🛡️ Security Guarantees
1. **Zero Client Plan Tampering**: `profiles.plan`, `convos_limit`, etc. cannot be updated by client sessions. Updates occur exclusively via validated Razorpay webhooks.
2. **Attribution-First Data Pipeline**: Visitors record first-touch and last-touch attribution (`utm_*`, `gclid`, `fbclid`, `ctwa_clid`, referrer) preserved into leads and conversation records.
3. **No Phantom Claims**: Honest pricing formulas, real live cost calculators, transparent platform fees, and verifiable case studies only.
