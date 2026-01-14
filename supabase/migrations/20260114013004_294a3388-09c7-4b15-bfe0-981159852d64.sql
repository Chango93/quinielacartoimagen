-- Enable realtime for matches table to broadcast score changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;