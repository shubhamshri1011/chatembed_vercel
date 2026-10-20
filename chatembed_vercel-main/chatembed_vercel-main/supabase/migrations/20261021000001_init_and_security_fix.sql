-- ============================================================
-- EMBEDEASE — PRODUCTION IDEMPOTENT MIGRATION & SECURITY HARDENING
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── 1. PROFILES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name     text,
  business_name text,
  website_url   text,
  industry      text,
  plan          text DEFAULT 'free_trial',
  plan_status   text DEFAULT 'active',
  convos_used   integer DEFAULT 0,
  convos_limit  integer DEFAULT 100,
  razorpay_id   text,
  gstin         text,
  is_admin      boolean DEFAULT false,
  joined_at     timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free_trial',
  ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS convos_used integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS convos_limit integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS razorpay_id text,
  ADD COLUMN IF NOT EXISTS gstin text,
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── 2. BOTS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bots (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name            text NOT NULL DEFAULT 'My Bot',
  emoji           text DEFAULT '💬',
  welcome_msg     text DEFAULT 'Hi! How can I help you today?',
  system_prompt   text DEFAULT 'You are a helpful assistant.',
  primary_color   text DEFAULT '#0E6B4D',
  bubble_color    text DEFAULT '#0E6B4D',
  website_url     text,
  lead_capture    boolean DEFAULT true,
  show_branding   boolean DEFAULT true,
  auto_open       boolean DEFAULT false,
  status          text DEFAULT 'live',
  ai_provider     text DEFAULT 'claude',
  training_status text DEFAULT 'untrained',
  trained_at      timestamptz,
  knowledge_base  text,
  convos_count    integer DEFAULT 0,
  leads_count     integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS training_status text DEFAULT 'untrained',
  ADD COLUMN IF NOT EXISTS trained_at timestamptz,
  ADD COLUMN IF NOT EXISTS knowledge_base text,
  ADD COLUMN IF NOT EXISTS convos_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_count integer DEFAULT 0;

-- ── 3. BOT KNOWLEDGE CHUNKS (RAG Vector Store) ─────────────────
CREATE TABLE IF NOT EXISTS public.bot_knowledge (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id     uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  content    text NOT NULL,
  embedding  vector(1536),
  created_at timestamptz DEFAULT now()
);

-- ── 4. CAMPAIGNS & TRACKING ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaigns (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  channel      text NOT NULL DEFAULT 'meta', -- meta, google_ads, hotstar, whatsapp, organic, referral
  objective    text DEFAULT 'leads',
  budget       numeric(12,2) DEFAULT 0.00,
  start_date   date,
  end_date     date,
  utm_campaign text,
  status       text DEFAULT 'active',
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_spend (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id  uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  date         date NOT NULL,
  spend        numeric(12,2) NOT NULL DEFAULT 0.00,
  impressions  integer DEFAULT 0,
  clicks       integer DEFAULT 0,
  source       text DEFAULT 'manual', -- manual, csv, api
  created_at   timestamptz DEFAULT now()
);

-- ── 5. LEADS TABLE (Attribution & CRM) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id        uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id   uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name          text,
  email         text NOT NULL,
  phone         text,
  score         integer DEFAULT 50,
  score_reason  text,
  status        text DEFAULT 'new', -- new, contacted, qualified, won, lost
  stage         text DEFAULT 'new',
  deal_value    numeric(12,2) DEFAULT 0.00,
  won_at        timestamptz,
  lost_reason   text,
  source_page   text,
  channel       text DEFAULT 'website',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  gclid         text,
  fbclid        text,
  ctwa_clid     text,
  first_touch   jsonb DEFAULT '{}',
  last_touch    jsonb DEFAULT '{}',
  session_id    text,
  consent       boolean DEFAULT true,
  consent_at    timestamptz DEFAULT now(),
  notes         text,
  captured_at   timestamptz DEFAULT now()
);

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score_reason text,
  ADD COLUMN IF NOT EXISTS stage text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS deal_value numeric(12,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS ctwa_clid text,
  ADD COLUMN IF NOT EXISTS first_touch jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_touch jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz DEFAULT now();

-- ── 6. CONVERSATIONS TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id       uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id   text,
  messages     jsonb DEFAULT '[]',
  msg_count    integer DEFAULT 0,
  resolved     boolean DEFAULT false,
  visitor_page text,
  language     text DEFAULT 'en',
  started_at   timestamptz DEFAULT now(),
  ended_at     timestamptz
);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

-- ── 7. EVENTS TABLE (Widget Attribution Telemetry) ─────────────
CREATE TABLE IF NOT EXISTS public.events (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id     uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  session_id text,
  lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  name       text NOT NULL, -- widget_loaded, widget_opened, message_sent, lead_form_shown, lead_submitted, handoff_requested, whatsapp_clicked, conversion
  props      jsonb DEFAULT '{}',
  page_url   text,
  created_at timestamptz DEFAULT now()
);

-- ── 8. WHATSAPP & USAGE COSTS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  campaign_id   uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_message_id text UNIQUE,
  phone         text,
  direction     text DEFAULT 'outbound', -- outbound, inbound
  category      text DEFAULT 'marketing', -- marketing, utility, authentication, service
  status        text DEFAULT 'sent', -- sent, delivered, read, replied, failed
  billable      boolean DEFAULT true,
  cost          numeric(8,4) DEFAULT 0.0000,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_costs (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  kind       text NOT NULL, -- ai_tokens, wa_message, video
  units      integer DEFAULT 1,
  cost       numeric(8,4) NOT NULL DEFAULT 0.0000,
  created_at timestamptz DEFAULT now()
);

-- ── 9. PAYMENTS TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  razorpay_payment_id  text UNIQUE,
  razorpay_order_id    text,
  plan                 text NOT NULL,
  billing_type         text DEFAULT 'monthly',
  amount               integer NOT NULL,
  currency             text DEFAULT 'INR',
  status               text DEFAULT 'success',
  paid_at              timestamptz DEFAULT now()
);

-- ── 10. PARTNERS & RESELLERS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partners (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  referral_code   text UNIQUE NOT NULL,
  commission_rate numeric(5,2) DEFAULT 20.00, -- percentage (e.g., 20.00%)
  brand_name      text,
  brand_logo_url  text,
  payout_details  jsonb DEFAULT '{}',
  status          text DEFAULT 'active',
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_clients (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  client_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(partner_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.commissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id  uuid REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  payment_id  uuid REFERENCES public.payments(id) ON DELETE CASCADE NOT NULL,
  amount      numeric(10,2) NOT NULL,
  status      text DEFAULT 'pending', -- pending, paid
  paid_at     timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- ── 11. AUTOMATIC PROFILE CREATION ON SIGNUP ──────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 12. SECURITY TRIGGER: PREVENT CLIENT PLAN TAMPERING ────────
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_tampering()
RETURNS trigger AS $$
BEGIN
  -- If invoked by service_role, allow all updates (Webhooks / Admin)
  IF (auth.jwt() ->> 'role') = 'service_role' OR current_user = 'postgres' THEN
    RETURN new;
  END IF;

  -- If regular authenticated user attempts to modify protected billing/plan columns, revert them
  IF (OLD.plan IS DISTINCT FROM NEW.plan) OR
     (OLD.plan_status IS DISTINCT FROM NEW.plan_status) OR
     (OLD.convos_limit IS DISTINCT FROM NEW.convos_limit) OR
     (OLD.convos_used IS DISTINCT FROM NEW.convos_used) OR
     (OLD.razorpay_id IS DISTINCT FROM NEW.razorpay_id) OR
     (OLD.is_admin IS DISTINCT FROM NEW.is_admin) THEN
    
    NEW.plan := OLD.plan;
    NEW.plan_status := OLD.plan_status;
    NEW.convos_limit := OLD.convos_limit;
    NEW.convos_used := OLD.convos_used;
    NEW.razorpay_id := OLD.razorpay_id;
    NEW.is_admin := OLD.is_admin;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_profile_plan_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_plan_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_plan_tampering();

-- ── 13. ROW LEVEL SECURITY (RLS) ──────────────────────────────
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_knowledge   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_spend        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_costs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions     ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view & update only their own profile
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Bots: Users own their bots
DROP POLICY IF EXISTS "bots_user_all" ON public.bots;
CREATE POLICY "bots_user_all" ON public.bots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bot Knowledge: Access via owning bot
DROP POLICY IF EXISTS "bot_knowledge_user_all" ON public.bot_knowledge;
CREATE POLICY "bot_knowledge_user_all" ON public.bot_knowledge FOR ALL
  USING (EXISTS (SELECT 1 FROM public.bots WHERE bots.id = bot_knowledge.bot_id AND bots.user_id = auth.uid()));

-- Campaigns & Spend
DROP POLICY IF EXISTS "campaigns_user_all" ON public.campaigns;
CREATE POLICY "campaigns_user_all" ON public.campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ad_spend_user_all" ON public.ad_spend;
CREATE POLICY "ad_spend_user_all" ON public.ad_spend FOR ALL
  USING (EXISTS (SELECT 1 FROM public.campaigns WHERE campaigns.id = ad_spend.campaign_id AND campaigns.user_id = auth.uid()));

-- Leads: Users own their leads
DROP POLICY IF EXISTS "leads_user_all" ON public.leads;
CREATE POLICY "leads_user_all" ON public.leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversations: Users own their conversations
DROP POLICY IF EXISTS "convos_user_all" ON public.conversations;
CREATE POLICY "convos_user_all" ON public.conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Events: Users can view telemetry for their bots
DROP POLICY IF EXISTS "events_user_select" ON public.events;
CREATE POLICY "events_user_select" ON public.events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bots WHERE bots.id = events.bot_id AND bots.user_id = auth.uid()));

-- WhatsApp & Usage costs
DROP POLICY IF EXISTS "wa_messages_user_all" ON public.wa_messages;
CREATE POLICY "wa_messages_user_all" ON public.wa_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_costs_user_all" ON public.usage_costs;
CREATE POLICY "usage_costs_user_all" ON public.usage_costs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Payments: Users can SELECT only their payments. NO CLIENT INSERT! (Only service_role via Razorpay webhook inserts)
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- Partners & Commissions
DROP POLICY IF EXISTS "partners_user_select" ON public.partners;
CREATE POLICY "partners_user_select" ON public.partners FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "partner_clients_user_select" ON public.partner_clients;
CREATE POLICY "partner_clients_user_select" ON public.partner_clients FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.partners WHERE partners.id = partner_clients.partner_id AND partners.user_id = auth.uid()));

DROP POLICY IF EXISTS "commissions_user_select" ON public.commissions;
CREATE POLICY "commissions_user_select" ON public.commissions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.partners WHERE partners.id = commissions.partner_id AND partners.user_id = auth.uid()));

-- ── 14. PERMISSIONS ───────────────────────────────────────────
GRANT SELECT, UPDATE(full_name, business_name, website_url, industry, gstin) ON public.profiles TO authenticated;
GRANT ALL ON public.bots          TO authenticated;
GRANT ALL ON public.bot_knowledge TO authenticated;
GRANT ALL ON public.campaigns     TO authenticated;
GRANT ALL ON public.ad_spend      TO authenticated;
GRANT ALL ON public.leads         TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT SELECT ON public.events     TO authenticated;
GRANT ALL ON public.wa_messages   TO authenticated;
GRANT ALL ON public.usage_costs   TO authenticated;
GRANT SELECT ON public.payments   TO authenticated;
GRANT SELECT ON public.partners   TO authenticated;
GRANT SELECT ON public.commissions TO authenticated;

-- Service role has full permissions on everything (Edge Functions)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ── 15. PERFORMANCE INDEXES ───────────────────────────────────
CREATE INDEX IF NOT EXISTS bots_user_id_idx        ON public.bots(user_id);
CREATE INDEX IF NOT EXISTS bot_knowledge_bot_idx   ON public.bot_knowledge(bot_id);
CREATE INDEX IF NOT EXISTS campaigns_user_id_idx   ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS ad_spend_campaign_idx   ON public.ad_spend(campaign_id);
CREATE INDEX IF NOT EXISTS leads_user_id_idx       ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_bot_id_idx        ON public.leads(bot_id);
CREATE INDEX IF NOT EXISTS leads_created_at_idx    ON public.leads(created_at);
CREATE INDEX IF NOT EXISTS convos_bot_id_idx       ON public.conversations(bot_id);
CREATE INDEX IF NOT EXISTS convos_user_id_idx      ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS events_bot_id_idx       ON public.events(bot_id);
CREATE INDEX IF NOT EXISTS events_session_id_idx   ON public.events(session_id);
CREATE INDEX IF NOT EXISTS wa_messages_user_idx    ON public.wa_messages(user_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx    ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS partners_referral_idx   ON public.partners(referral_code);

-- ── 16. RELOAD SCHEMA CACHE ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
