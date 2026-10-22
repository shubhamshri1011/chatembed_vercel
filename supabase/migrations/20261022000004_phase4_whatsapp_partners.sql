-- ============================================================
-- Phase 4: WhatsApp Automation + Partner/Reseller Program
-- ============================================================

-- 0. Admin flag + referral code on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin   BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ref_code   TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;

-- 1. WhatsApp Connected Numbers
CREATE TABLE IF NOT EXISTS wa_numbers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number_id  TEXT NOT NULL,
  display_phone    TEXT NOT NULL,
  waba_id          TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  verify_token     TEXT NOT NULL DEFAULT 'embedease_wa_verify_2026',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','error')),
  meta             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wa_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_numbers_owner" ON wa_numbers;
CREATE POLICY "wa_numbers_owner" ON wa_numbers USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. WhatsApp Templates
CREATE TABLE IF NOT EXISTS wa_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_number_id     UUID REFERENCES wa_numbers(id) ON DELETE SET NULL,
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
ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_templates_owner" ON wa_templates;
CREATE POLICY "wa_templates_owner" ON wa_templates USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 3. WhatsApp Campaigns
CREATE TABLE IF NOT EXISTS wa_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wa_number_id     UUID REFERENCES wa_numbers(id) ON DELETE SET NULL,
  template_id      UUID REFERENCES wa_templates(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at     TIMESTAMPTZ,
  recipients_total INTEGER DEFAULT 0,
  sent_count       INTEGER DEFAULT 0,
  delivered_count  INTEGER DEFAULT 0,
  read_count       INTEGER DEFAULT 0,
  replied_count    INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  total_cost       NUMERIC(12,4) DEFAULT 0,
  template_vars    JSONB DEFAULT '{}',
  audience_filter  JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_campaigns_owner" ON wa_campaigns;
CREATE POLICY "wa_campaigns_owner" ON wa_campaigns USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 4. WhatsApp Messages log
CREATE TABLE IF NOT EXISTS wa_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id      UUID REFERENCES wa_campaigns(id) ON DELETE SET NULL,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  wa_message_id    TEXT,
  direction        TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  to_phone         TEXT,
  from_phone       TEXT,
  category         TEXT,
  status           TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','replied','failed')),
  billable         BOOLEAN DEFAULT FALSE,
  cost             NUMERIC(10,4) DEFAULT 0,
  body_preview     TEXT,
  error_code       TEXT,
  error_message    TEXT,
  ts               TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_messages_owner" ON wa_messages;
CREATE POLICY "wa_messages_owner" ON wa_messages USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS wa_messages_user_ts ON wa_messages(user_id, ts DESC);
CREATE INDEX IF NOT EXISTS wa_messages_campaign ON wa_messages(campaign_id);

-- 5. Opt-in / Opt-out log
CREATE TABLE IF NOT EXISTS wa_opt_ins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'opted_in' CHECK (status IN ('opted_in','opted_out')),
  source           TEXT,
  consent_text     TEXT,
  ip_address       TEXT,
  opted_in_at      TIMESTAMPTZ DEFAULT NOW(),
  opted_out_at     TIMESTAMPTZ
);
ALTER TABLE wa_opt_ins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_opt_ins_owner" ON wa_opt_ins;
CREATE POLICY "wa_opt_ins_owner" ON wa_opt_ins USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE UNIQUE INDEX IF NOT EXISTS wa_opt_ins_user_phone ON wa_opt_ins(user_id, phone);

-- 6. Meta India Rate Card
CREATE TABLE IF NOT EXISTS wa_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL UNIQUE,
  rate_inr         NUMERIC(8,4) NOT NULL,
  platform_fee_inr NUMERIC(8,4) NOT NULL DEFAULT 0.05,
  effective_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO wa_rates (category, rate_inr, platform_fee_inr, notes) VALUES
  ('marketing',      0.78, 0.05, 'Meta India marketing rate Jan 2026'),
  ('utility',        0.31, 0.03, 'Meta India utility rate Jan 2026'),
  ('authentication', 0.14, 0.03, 'Meta India authentication rate Jan 2026'),
  ('service',        0.29, 0.03, 'Meta India service rate Jan 2026')
ON CONFLICT (category) DO NOTHING;
ALTER TABLE wa_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_rates_read" ON wa_rates;
CREATE POLICY "wa_rates_read" ON wa_rates FOR SELECT USING (TRUE);

-- 7. Partners
CREATE TABLE IF NOT EXISTS partners (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name    TEXT NOT NULL,
  contact_phone    TEXT,
  ref_code         TEXT NOT NULL UNIQUE,
  commission_pct   NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES auth.users(id),
  white_label_logo TEXT,
  white_label_name TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners_owner" ON partners;
CREATE POLICY "partners_owner" ON partners USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 8. Partner Clients
CREATE TABLE IF NOT EXISTS partner_clients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (partner_id, client_user_id)
);
ALTER TABLE partner_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_clients_owner" ON partner_clients;
CREATE POLICY "partner_clients_owner" ON partner_clients
  USING (partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid()));

-- 9. Commissions
CREATE TABLE IF NOT EXISTS commissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id           TEXT,
  subscription_amount  NUMERIC(12,2) NOT NULL,
  commission_pct       NUMERIC(5,2) NOT NULL,
  commission_amount    NUMERIC(12,2) NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  period_start         DATE,
  period_end           DATE,
  paid_at              TIMESTAMPTZ,
  payout_ref           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commissions_owner" ON commissions;
CREATE POLICY "commissions_owner" ON commissions
  USING (partner_id IN (SELECT id FROM partners WHERE user_id = auth.uid()));


-- 10. Admin Access Policies
DROP POLICY IF EXISTS "partners_admin" ON partners;
CREATE POLICY "partners_admin" ON partners FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
);

DROP POLICY IF EXISTS "commissions_admin" ON commissions;
CREATE POLICY "commissions_admin" ON commissions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
);

DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;
CREATE POLICY "profiles_admin_select" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
);
