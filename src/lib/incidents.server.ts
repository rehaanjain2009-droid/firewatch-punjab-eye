import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  DIRECTORY_COLUMNS,
  detectedAtIso,
  incidentKey,
  matchOfficers,
  type OfficerAssignment,
  type OfficerDirectoryRow,
} from "./officerMatch";
import { sendTelegram } from "./telegram.server";

/**
 * Incident lifecycle shared by the hourly cron (service client) and the
 * dashboard server functions (signed-in officer client). Every active fire is
 * written once to incidents_audit_log; dispatch is claimed atomically in the
 * database so the browser trigger and cron never double-send.
 */

type Client = SupabaseClient<Database>;

export type IncidentFire = {
  lat: number;
  lng: number;
  frp: number;
  confidence: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  daynight?: string | null;
  block?: string;
};

export type DispatchChannel = "auto_cron" | "auto_dashboard" | "manual";

let dirCache: { ts: number; rows: OfficerDirectoryRow[] } | null = null;
const DIR_TTL_MS = 60 * 60_000;

export async function loadOfficerDirectory(client: Client): Promise<OfficerDirectoryRow[]> {
  if (dirCache && Date.now() - dirCache.ts < DIR_TTL_MS) return dirCache.rows;
  const { data, error } = await client
    .from("officer_directory")
    .select(DIRECTORY_COLUMNS)
    .not("lat", "is", null)
    .limit(5000);
  if (error) throw new Error(`officer_directory: ${error.message}`);
  const rows = (data ?? []) as OfficerDirectoryRow[];
  dirCache = { ts: Date.now(), rows };
  return rows;
}

function toRow(f: IncidentFire, a: OfficerAssignment | null): Database["public"]["Tables"]["incidents_audit_log"]["Insert"] {
  return {
    fire_key: incidentKey(f),
    detected_at: detectedAtIso(f.acqDate, f.acqTime),
    lat: f.lat,
    lng: f.lng,
    frp: Number.isFinite(f.frp) ? f.frp : 0,
    confidence: Math.round(Number.isFinite(f.confidence) ? f.confidence : 0),
    satellite: f.satellite,
    daynight: f.daynight ?? null,
    block: a?.block ?? f.block ?? null,
    village: a?.village ?? null,
    village_distance_km: a?.distanceKm ?? null,
    assigned_officers: (a
      ? { village: a.village, block: a.block, thana: a.thana, approximate: a.approximate, officers: a.officers }
      : []) as unknown as Json,
  };
}

/** Insert every not-yet-logged active fire as status 'active'. Existing rows are untouched. */
export async function recordActiveIncidents(
  client: Client,
  fires: IncidentFire[],
  directory: OfficerDirectoryRow[],
): Promise<void> {
  if (fires.length === 0) return;
  const rows = fires.map((f) => toRow(f, matchOfficers(f.lat, f.lng, directory)));
  const { error } = await client
    .from("incidents_audit_log")
    .upsert(rows, { onConflict: "fire_key", ignoreDuplicates: true });
  if (error) throw new Error(`incidents_audit_log: ${error.message}`);
}

export async function dispatchIncident(
  client: Client,
  fire: IncidentFire,
  channel: DispatchChannel,
  force: boolean,
  directory: OfficerDirectoryRow[],
): Promise<{ ok: boolean; status: number; body: string; skipped?: boolean }> {
  const assignment = matchOfficers(fire.lat, fire.lng, directory);
  await recordActiveIncidents(client, [fire], directory);
  const key = incidentKey(fire);

  const { data: before } = await client
    .from("incidents_audit_log")
    .select("dispatched_at")
    .eq("fire_key", key)
    .maybeSingle();
  const wasDispatched = !!before?.dispatched_at;

  const { data: claimed, error } = await client.rpc("claim_incident_dispatch", {
    _fire_key: key,
    _channel: channel,
    _force: force,
  });
  if (error) return { ok: false, status: 500, body: error.message };
  if (!claimed) return { ok: true, status: 208, body: "Already dispatched", skipped: true };

  const r = await sendTelegram({
    block: assignment?.block ?? fire.block ?? "Ludhiana",
    lat: fire.lat,
    lng: fire.lng,
    confidence: fire.confidence,
    frp: fire.frp,
    acqDate: fire.acqDate,
    acqTime: fire.acqTime,
    satellite: fire.satellite,
    assignment,
  });

  if (!r.ok && !wasDispatched) {
    // Release the claim so the next run can retry; the failed attempt stays in status_history.
    await client
      .from("incidents_audit_log")
      .update({ status: "active", dispatched_at: null, dispatch_channel: null })
      .eq("fire_key", key)
      .eq("status", "dispatched");
  }
  return r;
}
