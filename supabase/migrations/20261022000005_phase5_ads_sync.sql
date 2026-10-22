-- ============================================================
-- Phase 5 Migration: Meta / Google Ads Spend Sync & Ad Accounts
-- ============================================================

-- ── 1. Ad Accounts Table (Server-side stored tokens) ────────
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'google_ads')),
  account_id       TEXT NOT NULL,
  account_name     TEXT,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  last_synced_at   TIMESTAMPTZ,
  meta             JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, account_id)
);

ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_accounts_owner ON public.ad_accounts;
CREATE POLICY ad_accounts_owner ON public.ad_accounts
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Token security: Browser can NEVER SELECT access_token or refresh_token
REVOKE SELECT ON public.ad_accounts FROM authenticated, anon;
GRANT SELECT (id, user_id, platform, account_id, account_name, status, last_synced_at, created_at, updated_at)
  ON public.ad_accounts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ad_accounts FROM authenticated, anon;
GRANT ALL ON public.ad_accounts TO service_role;

-- ── 2. Performance & Deduplication on ad_spend & campaigns ───
ALTER TABLE public.ad_spend ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Deduplicate any existing duplicates before index creation
DELETE FROM public.ad_spend a USING public.ad_spend b
WHERE a.ctid < b.ctid
  AND a.campaign_id = b.campaign_id
  AND a.date = b.date;

CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_camp_date_idx ON public.ad_spend(campaign_id, date);

DELETE FROM public.campaigns a USING public.campaigns b
WHERE a.ctid < b.ctid
  AND a.user_id = b.user_id
  AND a.channel = b.channel
  AND a.name = b.name;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_user_channel_name_idx ON public.campaigns(user_id, channel, name);

-- Ensure RLS on ad_spend allows user_id OR campaign ownership
DROP POLICY IF EXISTS ad_spend_user_all ON public.ad_spend;
CREATE POLICY ad_spend_user_all ON public.ad_spend FOR ALL
  USING (
    auth.uid() = user_id 
    OR EXISTS (SELECT 1 FROM public.campaigns WHERE campaigns.id = ad_spend.campaign_id AND campaigns.user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR EXISTS (SELECT 1 FROM public.campaigns WHERE campaigns.id = ad_spend.campaign_id AND campaigns.user_id = auth.uid())
    OR public.is_admin()
  );

NOTIFY pgrst, 'reload schema';
