-- ============================================================
-- CHATEMBED — COMPLETE SUPABASE SETUP (Run this ONCE)
-- Copy everything below and paste in SQL Editor → Run
-- ============================================================

-- Drop existing tables to start fresh (safe — no data yet)
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.bots CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ── PROFILES ─────────────────────────────────────────────────
CREATE TABLE public.profiles (
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
  joined_at     timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ── BOTS ─────────────────────────────────────────────────────
CREATE TABLE public.bots (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name           text NOT NULL DEFAULT 'My Bot',
  emoji          text DEFAULT '💬',
  welcome_msg    text DEFAULT 'Hi! How can I help you today?',
  system_prompt  text DEFAULT 'You are a helpful assistant.',
  primary_color  text DEFAULT '#0E6B4D',
  bubble_color   text DEFAULT '#0E6B4D',
  website_url    text,
  lead_capture   boolean DEFAULT false,
  show_branding  boolean DEFAULT true,
  auto_open      boolean DEFAULT false,
  status         text DEFAULT 'live',
  convos_count   integer DEFAULT 0,
  leads_count    integer DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ── LEADS ─────────────────────────────────────────────────────
CREATE TABLE public.leads (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id      uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text,
  email       text NOT NULL,
  phone       text,
  score       integer DEFAULT 50,
  status      text DEFAULT 'new',
  source_page text,
  notes       text,
  captured_at timestamptz DEFAULT now()
);

-- ── CONVERSATIONS ─────────────────────────────────────────────
CREATE TABLE public.conversations (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id       uuid REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id   text,
  messages     jsonb DEFAULT '[]',
  msg_count    integer DEFAULT 0,
  resolved     boolean DEFAULT false,
  visitor_page text,
  started_at   timestamptz DEFAULT now(),
  ended_at     timestamptz
);

-- ── PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE public.payments (
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

-- ── AUTO-CREATE PROFILE ON SIGNUP ────────────────────────────
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

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments     ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Bots
DROP POLICY IF EXISTS "bots_all" ON public.bots;
CREATE POLICY "bots_all" ON public.bots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Leads
DROP POLICY IF EXISTS "leads_all" ON public.leads;
CREATE POLICY "leads_all" ON public.leads FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversations
DROP POLICY IF EXISTS "convos_all" ON public.conversations;
CREATE POLICY "convos_all" ON public.conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Payments
DROP POLICY IF EXISTS "payments_select" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── PERMISSIONS ───────────────────────────────────────────────
GRANT ALL ON public.profiles      TO authenticated;
GRANT ALL ON public.bots          TO authenticated;
GRANT ALL ON public.leads         TO authenticated;
GRANT ALL ON public.conversations TO authenticated;
GRANT ALL ON public.payments      TO authenticated;

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bots_user_id_idx     ON public.bots(user_id);
CREATE INDEX IF NOT EXISTS leads_user_id_idx    ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS leads_bot_id_idx     ON public.leads(bot_id);
CREATE INDEX IF NOT EXISTS convos_bot_id_idx    ON public.conversations(bot_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments(user_id);

-- ── RELOAD SCHEMA CACHE ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

SELECT 'SUCCESS! All tables created. You can now create bots.' AS status;
