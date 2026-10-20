-- Run this in Supabase SQL Editor
-- Adds columns needed for new features

ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS ai_provider      text    DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS training_status  text    DEFAULT 'untrained',
  ADD COLUMN IF NOT EXISTS trained_at       timestamptz,
  ADD COLUMN IF NOT EXISTS knowledge_base   text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS convos_used      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS convos_limit     integer DEFAULT 100;

-- Reload schema
NOTIFY pgrst, 'reload schema';

SELECT 'Columns added successfully!' as status;
