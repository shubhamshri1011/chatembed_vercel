-- Migration: 20261021000002_default_brand_color_theme.sql
-- Description: Updates default widget colors from legacy blue (#4F8EF7) to unified brand green (#0E6B4D)

ALTER TABLE public.bots 
  ALTER COLUMN primary_color SET DEFAULT '#0E6B4D',
  ALTER COLUMN bubble_color SET DEFAULT '#0E6B4D';

-- Update existing default blue bots to new brand color if they were using the previous default
UPDATE public.bots 
SET primary_color = '#0E6B4D' 
WHERE primary_color = '#4F8EF7' OR primary_color IS NULL;

UPDATE public.bots 
SET bubble_color = '#0E6B4D' 
WHERE bubble_color = '#4F8EF7' OR bubble_color IS NULL;
