CREATE TABLE public.burn_scar_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fire_key text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  acq_date date NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('confirmed','not_detected','awaiting_imagery','insufficient_clear')),
  burned_ha numeric NOT NULL DEFAULT 0,
  burned_acres numeric NOT NULL DEFAULT 0,
  audited_ha numeric,
  clear_fraction numeric,
  mean_dnbr_burned numeric,
  mean_dnbr_all numeric,
  mean_pre_nbr numeric,
  mean_post_nbr numeric,
  pre_scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  post_scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pre_window_start date,
  pre_window_end date,
  post_window_start date,
  post_window_end date,
  method jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto_cron')),
  verified_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX burn_scar_verifications_fire_key_idx ON public.burn_scar_verifications (fire_key, created_at DESC);

GRANT SELECT, INSERT ON public.burn_scar_verifications TO authenticated;
GRANT ALL ON public.burn_scar_verifications TO service_role;

ALTER TABLE public.burn_scar_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in officers can read burn scar verifications"
ON public.burn_scar_verifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Signed-in officers can record their own manual verifications"
ON public.burn_scar_verifications FOR INSERT TO authenticated
WITH CHECK (verified_by = auth.uid() AND source = 'manual');

-- Evidence records are append-only, like the incident audit log.
CREATE OR REPLACE FUNCTION public.block_burn_scar_verification_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'burn_scar_verifications is append-only';
END;
$$;

CREATE TRIGGER burn_scar_verifications_append_only
BEFORE UPDATE OR DELETE ON public.burn_scar_verifications
FOR EACH ROW EXECUTE FUNCTION public.block_burn_scar_verification_changes();