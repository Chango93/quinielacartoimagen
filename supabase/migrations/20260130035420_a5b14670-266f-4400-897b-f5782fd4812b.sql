-- Create table for World Cup 2026 interest survey
CREATE TABLE public.world_cup_interest (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    is_interested boolean NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.world_cup_interest ENABLE ROW LEVEL SECURITY;

-- Users can insert their own response
CREATE POLICY "Users can insert their own response"
ON public.world_cup_interest
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own response
CREATE POLICY "Users can view their own response"
ON public.world_cup_interest
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all responses
CREATE POLICY "Admins can view all responses"
ON public.world_cup_interest
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));