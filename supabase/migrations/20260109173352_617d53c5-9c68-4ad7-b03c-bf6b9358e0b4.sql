-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create function to auto-close matchdays
CREATE OR REPLACE FUNCTION public.auto_close_matchdays()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.matchdays
    SET is_open = false, updated_at = now()
    WHERE is_open = true
    AND end_date IS NOT NULL
    AND end_date <= now();
END;
$$;

-- Schedule the function to run every 5 minutes
SELECT cron.schedule(
    'auto-close-matchdays',
    '*/5 * * * *',
    'SELECT public.auto_close_matchdays()'
);