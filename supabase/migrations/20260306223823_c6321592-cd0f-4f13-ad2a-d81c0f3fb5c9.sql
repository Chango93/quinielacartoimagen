
CREATE TABLE public.matchday_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  matchday_id uuid NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  stripe_session_id text,
  amount_cents integer NOT NULL DEFAULT 5000,
  currency text NOT NULL DEFAULT 'mxn',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, matchday_id)
);

ALTER TABLE public.matchday_payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view their own payments"
  ON public.matchday_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all payments
CREATE POLICY "Admins can view all payments"
  ON public.matchday_payments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage all payments
CREATE POLICY "Admins can manage all payments"
  ON public.matchday_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Users can insert their own payments (for creating pending records)
CREATE POLICY "Users can insert own payments"
  ON public.matchday_payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_matchday_payments_updated_at
  BEFORE UPDATE ON public.matchday_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
