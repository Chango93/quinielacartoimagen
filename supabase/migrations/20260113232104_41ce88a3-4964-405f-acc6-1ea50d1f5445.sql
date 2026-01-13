-- Add is_current column to matchdays
ALTER TABLE public.matchdays 
ADD COLUMN is_current boolean NOT NULL DEFAULT false;

-- Create a function to ensure only one matchday is current at a time
CREATE OR REPLACE FUNCTION public.set_single_current_matchday()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- If setting a matchday as current, unset all others
    IF NEW.is_current = true THEN
        UPDATE public.matchdays 
        SET is_current = false 
        WHERE id != NEW.id AND is_current = true;
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger to enforce single current matchday
CREATE TRIGGER ensure_single_current_matchday
BEFORE INSERT OR UPDATE OF is_current ON public.matchdays
FOR EACH ROW
WHEN (NEW.is_current = true)
EXECUTE FUNCTION public.set_single_current_matchday();