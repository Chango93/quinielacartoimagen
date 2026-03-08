
CREATE TABLE public.league_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  drawn integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  goals_for integer NOT NULL DEFAULT 0,
  goals_against integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(team_id)
);

ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view standings" ON public.league_standings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage standings" ON public.league_standings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
