CREATE TABLE public.officer_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  s_no integer,
  district text NOT NULL DEFAULT 'Ludhiana',
  tehsil text,
  block text NOT NULL,
  village text NOT NULL,
  hb_no text,
  thana text,
  lat double precision,
  lng double precision,
  location_source text,
  patwari_name text,
  patwari_contact text,
  sho_name text,
  sho_contact text,
  nodal_officer_name text,
  nodal_officer_designation text,
  nodal_officer_contact text,
  dsp_name text,
  dsp_contact text,
  sdm_name text,
  sdm_contact text,
  cluster_officer_name text,
  cluster_officer_contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_officer_directory_block ON public.officer_directory (block);
CREATE INDEX idx_officer_directory_located ON public.officer_directory (lat, lng) WHERE lat IS NOT NULL;

GRANT SELECT ON public.officer_directory TO authenticated;
GRANT ALL ON public.officer_directory TO service_role;
ALTER TABLE public.officer_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in officers read directory" ON public.officer_directory
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.incidents_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fire_key text NOT NULL UNIQUE,
  detected_at timestamptz NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  frp double precision NOT NULL DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0,
  satellite text,
  daynight text,
  block text,
  village text,
  village_distance_km double precision,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','dispatched','resolved','false_alarm')),
  assigned_officers jsonb NOT NULL DEFAULT '[]'::jsonb,
  dispatched_at timestamptz,
  dispatch_channel text,
  dispatch_count integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  resolved_by uuid,
  field_notes text,
  proof_image_urls text[] NOT NULL DEFAULT '{}',
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_detected_at ON public.incidents_audit_log (detected_at DESC);
CREATE INDEX idx_incidents_status ON public.incidents_audit_log (status);

GRANT SELECT, INSERT, UPDATE ON public.incidents_audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.incidents_audit_log TO service_role;
ALTER TABLE public.incidents_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in officers read incidents" ON public.incidents_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in officers log incidents" ON public.incidents_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Signed-in officers update incidents" ON public.incidents_audit_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Lifecycle bookkeeping: detection facts are immutable, every status change is
-- appended to status_history, and dispatch / resolution timestamps are stamped.
CREATE OR REPLACE FUNCTION public.incidents_audit_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_history := jsonb_build_array(jsonb_build_object(
      'status', NEW.status, 'at', now(), 'by', auth.uid(), 'channel', NEW.dispatch_channel));
    IF NEW.status = 'dispatched' AND NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
    IF NEW.status IN ('resolved','false_alarm') AND NEW.resolved_at IS NULL THEN NEW.resolved_at := now(); END IF;
    RETURN NEW;
  END IF;

  NEW.fire_key := OLD.fire_key;
  NEW.detected_at := OLD.detected_at;
  NEW.lat := OLD.lat;
  NEW.lng := OLD.lng;
  NEW.frp := OLD.frp;
  NEW.confidence := OLD.confidence;
  NEW.satellite := OLD.satellite;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_history := OLD.status_history || jsonb_build_array(jsonb_build_object(
      'status', NEW.status, 'at', now(), 'by', auth.uid(), 'from', OLD.status));
    IF NEW.status = 'dispatched' AND NEW.dispatched_at IS NULL THEN NEW.dispatched_at := now(); END IF;
    IF NEW.status IN ('resolved','false_alarm') THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
      NEW.resolved_by := COALESCE(NEW.resolved_by, auth.uid());
    ELSE
      NEW.resolved_at := NULL;
      NEW.resolved_by := NULL;
    END IF;
  ELSE
    NEW.status_history := OLD.status_history;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_incidents_audit_lifecycle
BEFORE INSERT OR UPDATE ON public.incidents_audit_log
FOR EACH ROW EXECUTE FUNCTION public.incidents_audit_lifecycle();

CREATE OR REPLACE FUNCTION public.incidents_audit_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'incidents_audit_log is a permanent compliance record; rows cannot be deleted';
END;
$$;

CREATE TRIGGER trg_incidents_audit_block_delete
BEFORE DELETE ON public.incidents_audit_log
FOR EACH ROW EXECUTE FUNCTION public.incidents_audit_block_delete();

-- Atomic dispatch claim so the browser trigger and hourly job never double-send.
CREATE OR REPLACE FUNCTION public.claim_incident_dispatch(_fire_key text, _channel text, _force boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  claimed boolean;
BEGIN
  UPDATE public.incidents_audit_log
     SET status = CASE WHEN status = 'active' THEN 'dispatched' ELSE status END,
         dispatched_at = COALESCE(dispatched_at, now()),
         dispatch_channel = COALESCE(dispatch_channel, _channel),
         dispatch_count = dispatch_count + 1
   WHERE fire_key = _fire_key
     AND (_force OR dispatched_at IS NULL)
  RETURNING true INTO claimed;
  RETURN COALESCE(claimed, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_incident_dispatch(text, text, boolean) TO authenticated, service_role;

-- Proof photos: private bucket, signed-in officers upload and view.
CREATE POLICY "Officers upload incident proofs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'incident-proofs');
CREATE POLICY "Officers view incident proofs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'incident-proofs');