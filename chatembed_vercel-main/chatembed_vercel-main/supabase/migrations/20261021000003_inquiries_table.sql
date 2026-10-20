-- ============================================================
-- EMBEDEASE — INQUIRIES & LEAD CAPTURE TABLE
-- Stores submissions from website contact forms, partner requests,
-- booking forms, and pricing queries.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inquiries (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  form_name    text NOT NULL DEFAULT 'website_contact',
  name         text,
  email        text NOT NULL,
  phone        text,
  company      text,
  message      text,
  fields       jsonb DEFAULT '{}',
  page_url     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_term     text,
  utm_content  text,
  gclid        text,
  fbclid       text,
  ctwa_clid    text,
  ip_address   text,
  user_agent   text,
  status       text DEFAULT 'new',
  created_at   timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous insertions (site visitors)
DROP POLICY IF EXISTS "public_insert_inquiries" ON public.inquiries;
CREATE POLICY "public_insert_inquiries" ON public.inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated admins to view inquiries
DROP POLICY IF EXISTS "admin_select_inquiries" ON public.inquiries;
CREATE POLICY "admin_select_inquiries" ON public.inquiries
  FOR SELECT TO authenticated
  USING (true);
