-- ============================================================
-- Phase 4 Reconciled Migration: WhatsApp Automation + Partners
-- Safe for fresh databases AND existing databases
-- ============================================================

-- ── 0. Profiles Extensions ───────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- ── 1. Admin Helper Function (SECURITY DEFINER, no recursion) ──
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), FALSE);
$$;

-- ── 2. WhatsApp Numbers & Credential Security ────────────────
CREATE TABLE IF NOT EXISTS public.wa_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id  TEXT NOT NULL UNIQUE,
  display_phone    TEXT NOT NULL,
  waba_id          TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  verify_token     TEXT NOT NULL DEFAULT 'embedease_wa_verify_2026',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','error')),
  meta             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wa_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_numbers_owner_select" ON public.wa_numbers;
CREATE POLICY "wa_numbers_owner_select" ON public.wa_numbers
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Requirement 2: Never allow browser to SELECT access_token
REVOKE SELECT ON public.wa_numbers FROM authenticated, anon;
GRANT SELECT (id, user_id, phone_number_id, display_phone, waba_id, verify_token, status, meta, created_at, updated_at) 
  ON public.wa_numbers TO authenticated;

-- Direct browser insert/update revoked; write via edge function (service_role) only
REVOKE INSERT, UPDATE, DELETE ON public.wa_numbers FROM authenticated, anon;
GRANT ALL ON public.wa_numbers TO service_role;

-- ── 3. WhatsApp Templates ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_number_id     UUID REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  language         TEXT NOT NULL DEFAULT 'en',
  category         TEXT NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  components       JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PAUSED')),
  rejection_reason TEXT,
  meta_template_id TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_templates_owner" ON public.wa_templates;
CREATE POLICY "wa_templates_owner" ON public.wa_templates
  FOR ALL USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ── 4. WhatsApp Campaigns (with Resumable Chunking) ──────────
CREATE TABLE IF NOT EXISTS public.wa_campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_number_id         UUID REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  template_id          UUID REFERENCES public.wa_templates(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at         TIMESTAMPTZ,
  recipients_total     INTEGER DEFAULT 0,
  sent_count           INTEGER DEFAULT 0,
  delivered_count      INTEGER DEFAULT 0,
  read_count           INTEGER DEFAULT 0,
  replied_count        INTEGER DEFAULT 0,
  failed_count         INTEGER DEFAULT 0,
  total_cost           NUMERIC(12,4) DEFAULT 0,
  template_vars        JSONB DEFAULT '{}',
  audience_filter      JSONB DEFAULT '{}',
  last_processed_index INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wa_campaigns ADD COLUMN IF NOT EXISTS last_processed_index INTEGER DEFAULT 0;
ALTER TABLE public.wa_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_campaigns_owner" ON public.wa_campaigns;
CREATE POLICY "wa_campaigns_owner" ON public.wa_campaigns
  FOR ALL USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ── 5. Reconcile wa_messages ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES public.wa_campaigns(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_message_id TEXT UNIQUE,
  phone         TEXT,
  direction     TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  category      TEXT DEFAULT 'marketing',
  status        TEXT DEFAULT 'sent',
  billable      BOOLEAN DEFAULT TRUE,
  cost          NUMERIC(8,4) DEFAULT 0.0000,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Reconcile additional columns on wa_messages
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS to_phone TEXT;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS from_phone TEXT;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS body_preview TEXT;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.wa_messages ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_owner" ON public.wa_messages;
CREATE POLICY "wa_messages_owner" ON public.wa_messages
  FOR ALL USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE INDEX IF NOT EXISTS wa_messages_user_idx ON public.wa_messages(user_id);
CREATE INDEX IF NOT EXISTS wa_messages_wamid_idx ON public.wa_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS wa_messages_camp_idx ON public.wa_messages(campaign_id);

-- ── 6. Opt-ins / Opt-outs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_opt_ins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'opted_in' CHECK (status IN ('opted_in','opted_out')),
  source       TEXT,
  consent_text TEXT,
  ip_address   TEXT,
  opted_in_at  TIMESTAMPTZ DEFAULT NOW(),
  opted_out_at TIMESTAMPTZ
);

ALTER TABLE public.wa_opt_ins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_opt_ins_owner" ON public.wa_opt_ins;
CREATE POLICY "wa_opt_ins_owner" ON public.wa_opt_ins
  FOR ALL USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE UNIQUE INDEX IF NOT EXISTS wa_opt_ins_user_phone ON public.wa_opt_ins(user_id, phone);

-- ── 7. Meta India Rate Card (wa_rates) ────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL UNIQUE,
  rate_inr         NUMERIC(8,4) NOT NULL,
  platform_fee_inr NUMERIC(8,4) NOT NULL DEFAULT 0.05,
  is_estimate      BOOLEAN DEFAULT TRUE,
  effective_from   DATE DEFAULT '2026-01-01',
  source_url       TEXT DEFAULT 'https://developers.facebook.com/docs/whatsapp/pricing',
  notes            TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wa_rates ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN DEFAULT TRUE;
ALTER TABLE public.wa_rates ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT '2026-01-01';
ALTER TABLE public.wa_rates ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT 'https://developers.facebook.com/docs/whatsapp/pricing';

INSERT INTO public.wa_rates (category, rate_inr, platform_fee_inr, is_estimate, effective_from, source_url, notes) VALUES
  ('marketing',      0.78, 0.05, true, '2026-01-01', 'https://developers.facebook.com/docs/whatsapp/pricing', 'Meta India marketing rate estimate Jan 2026'),
  ('utility',        0.31, 0.03, true, '2026-01-01', 'https://developers.facebook.com/docs/whatsapp/pricing', 'Meta India utility rate estimate Jan 2026'),
  ('authentication', 0.14, 0.03, true, '2026-01-01', 'https://developers.facebook.com/docs/whatsapp/pricing', 'Meta India authentication rate estimate Jan 2026'),
  ('service',        0.00, 0.00, false, '2026-01-01', 'https://developers.facebook.com/docs/whatsapp/pricing', 'Free within 24-hour customer service window')
ON CONFLICT (category) DO UPDATE SET
  rate_inr         = EXCLUDED.rate_inr,
  platform_fee_inr = EXCLUDED.platform_fee_inr,
  is_estimate      = EXCLUDED.is_estimate,
  effective_from   = EXCLUDED.effective_from,
  source_url       = EXCLUDED.source_url,
  notes            = EXCLUDED.notes;

ALTER TABLE public.wa_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_rates_read" ON public.wa_rates;
CREATE POLICY "wa_rates_read" ON public.wa_rates FOR SELECT USING (TRUE);

-- ── 8. Reconcile Partners Table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  referral_code   TEXT UNIQUE NOT NULL,
  commission_rate NUMERIC(5,2) DEFAULT 20.00,
  brand_name      TEXT,
  brand_logo_url  TEXT,
  payout_details  JSONB DEFAULT '{}',
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Reconcile all column variants to canonical names
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 20.00;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS brand_logo_url TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2) DEFAULT 20.00;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS notes TEXT;

-- Sync values across aliases
UPDATE public.partners SET referral_code = COALESCE(referral_code, ref_code);
UPDATE public.partners SET ref_code = COALESCE(ref_code, referral_code);
UPDATE public.partners SET commission_rate = COALESCE(commission_rate, commission_pct, 20.00);
UPDATE public.partners SET commission_pct = COALESCE(commission_pct, commission_rate, 20.00);
UPDATE public.partners SET brand_name = COALESCE(brand_name, business_name);
UPDATE public.partners SET business_name = COALESCE(business_name, brand_name);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners_owner" ON public.partners;
CREATE POLICY "partners_owner" ON public.partners
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "partners_admin_all" ON public.partners;
CREATE POLICY "partners_admin_all" ON public.partners
  FOR ALL USING (public.is_admin());

-- ── 9. Reconcile Partner Clients Table ────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_clients (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  client_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_id, client_id)
);

ALTER TABLE public.partner_clients ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES auth.users(id);
ALTER TABLE public.partner_clients ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.partner_clients ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.partner_clients SET client_id = COALESCE(client_id, client_user_id);
UPDATE public.partner_clients SET client_user_id = COALESCE(client_user_id, client_id);

ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_clients_owner" ON public.partner_clients;
CREATE POLICY "partner_clients_owner" ON public.partner_clients
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.partners WHERE partners.id = partner_clients.partner_id AND partners.user_id = auth.uid())
    OR public.is_admin()
  );

-- ── 10. Reconcile Commissions Table ───────────────────────────
CREATE TABLE IF NOT EXISTS public.commissions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id          UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  payment_id          UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS subscription_amount NUMERIC(12,2);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS payout_ref TEXT;

UPDATE public.commissions SET amount = COALESCE(amount, commission_amount, 0);
UPDATE public.commissions SET commission_amount = COALESCE(commission_amount, amount, 0);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commissions_owner" ON public.commissions;
CREATE POLICY "commissions_owner" ON public.commissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.partners WHERE partners.id = commissions.partner_id AND partners.user_id = auth.uid())
    OR public.is_admin()
  );
DROP POLICY IF EXISTS "commissions_admin_all" ON public.commissions;
CREATE POLICY "commissions_admin_all" ON public.commissions
  FOR ALL USING (public.is_admin());

-- ── 11. Server-Side Referral Attribution Trigger ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $
DECLARE
  v_ref_code text;
  v_partner_id uuid;
  v_partner_user_id uuid;
BEGIN
  -- Read ref code passed via options.data.ref (or fallback options.data.referred_by)
  v_ref_code := TRIM(COALESCE(new.raw_user_meta_data->>'ref', new.raw_user_meta_data->>'referred_by', ''));

  -- 1. Create or Update Profile
  INSERT INTO public.profiles (id, full_name, referred_by)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    NULLIF(v_ref_code, '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = COALESCE(profiles.full_name, EXCLUDED.full_name),
    referred_by = COALESCE(profiles.referred_by, NULLIF(v_ref_code, ''));

  -- 2. Referral attribution (blocks self-referral)
  IF v_ref_code <> '' THEN
    SELECT id, user_id INTO v_partner_id, v_partner_user_id
    FROM public.partners
    WHERE UPPER(COALESCE(ref_code, referral_code, '')) = UPPER(v_ref_code)
       OR UPPER(COALESCE(referral_code, ref_code, '')) = UPPER(v_ref_code)
    LIMIT 1;

    -- Enforce: partner cannot refer themselves
    IF v_partner_id IS NOT NULL AND v_partner_user_id <> new.id THEN
      INSERT INTO public.partner_clients (partner_id, client_id, client_user_id, referred_at)
      VALUES (v_partner_id, new.id, new.id, NOW())
      ON CONFLICT (partner_id, client_id) DO NOTHING;
    END IF;
  END IF;

  RETURN new;
END;
$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure auth trigger is active
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

NOTIFY pgrst, 'reload schema';
