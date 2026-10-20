# EmbedEase — Google & Launch Checklist

> Complete this before announcing the public URL. Each item is actionable.

---

## 1. Google Search Console

1. Go to https://search.google.com/search-console → Add Property → **Domain** → embedease.in
2. Verify via **DNS TXT record** (add to your registrar)
3. Submit sitemap: https://embedease.in/sitemap.xml
4. Use **URL Inspection** → "Request Indexing" for each new landing page
5. Check **Coverage** report after 3–5 days for crawl errors

---

## 2. Google Analytics 4

1. Go to https://analytics.google.com → New Property → embedease.in
2. Copy **Measurement ID** (G-XXXXXXXXXX)
3. Add to every <head>:

`html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
`

4. Mark generate_lead as a **Conversion** event
5. Link GA4 → Google Ads for GCLID import

---

## 3. Google Business Profile

1. Go to https://business.google.com → Add your business
2. Category: **Software Company**
3. Website: https://embedease.in
4. Services: AI Chatbot, WhatsApp Marketing, Lead Tracking, Performance Marketing
5. Verify via postcard or phone

---

## 4. Bing & Microsoft Clarity

1. https://bing.com/webmasters → Import from GSC (instant)
2. Submit sitemap
3. https://clarity.microsoft.com → free heatmaps → add snippet to <head>

---

## 5. DNS & Email Deliverability

`
Type  Host               Value
TXT   @                  v=spf1 include:_spf.resend.com ~all
TXT   resend._domainkey  [DKIM from Resend dashboard]
TXT   _dmarc             v=DMARC1; p=quarantine; rua=mailto:dmarc@embedease.in
MX    @                  [your inbox/transactional provider]
`

Test: https://mxtoolbox.com/SuperTool.aspx

---

## 6. Supabase Production Deployment

`ash
# Deploy edge functions
supabase functions deploy notify-inquiry
supabase functions deploy lead

# Set secrets
supabase secrets set RESEND_API_KEY=re_xxxx

# Run migrations
supabase db push
`

Verify RLS on inquiries table allows non INSERT.

---

## 7. Pre-Launch Checklist

- [ ] All pages load without console errors
- [ ] Contact form submits → email at support@embedease.in
- [ ] Widget lead form → email at bot owner's email
- [ ] https://embedease.in/sitemap.xml loads valid XML
- [ ] https://embedease.in/robots.txt loads correctly
- [ ] OG image shows on WhatsApp/LinkedIn share (test: https://opengraph.xyz)
- [ ] Lighthouse Mobile score >= 85
- [ ] No 404 errors on any linked page
- [ ] Razorpay checkout works (test mode → then live mode)
- [ ] Google Search Console verified
- [ ] GA4 Realtime shows live visits

---

## 8. Post-Launch Week 1

- Monitor GSC Coverage for crawl errors
- Submit to Product Hunt, IndieHackers, LinkedIn
- List on IndiaMART and Clutch.co for local business discovery
- Check GA4 Realtime → Acquisition for first organic traffic
