-- Add is_concluded field to matchdays table
ALTER TABLE public.matchdays 
ADD COLUMN is_concluded boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.matchdays.is_concluded IS 'Manually marked when matchday is fully concluded and champions should be shown';