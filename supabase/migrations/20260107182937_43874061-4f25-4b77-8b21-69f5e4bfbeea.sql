-- Crear bucket para logos de equipos
INSERT INTO storage.buckets (id, name, public) VALUES ('team-logos', 'team-logos', true);

-- Política para ver logos (público)
CREATE POLICY "Anyone can view team logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-logos');

-- Política para que admins suban logos
CREATE POLICY "Admins can upload team logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'));

-- Política para que admins actualicen logos
CREATE POLICY "Admins can update team logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'));

-- Política para que admins eliminen logos
CREATE POLICY "Admins can delete team logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'));