import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadOfficerDirectory, recordActiveIncidents } from "./incidents.server";
import { incidentKey } from "./officerMatch";

const FireSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  frp: z.number().min(0).max(100000),
  confidence: z.number().min(0).max(100),
  acqDate: z.string().min(1).max(20),
  acqTime: z.string().max(8),
  satellite: z.string().min(1).max(60),
  daynight: z.string().max(2).optional(),
  block: z.string().max(120).optional(),
});

/** Log every active (unmasked) fire and return the current audit state for each. */
export const syncIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fires: unknown[] }) => z.object({ fires: z.array(FireSchema).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const directory = await loadOfficerDirectory(context.supabase);
    await recordActiveIncidents(context.supabase, data.fires, directory);
    const keys = data.fires.map(incidentKey);
    if (keys.length === 0) return { incidents: [] };
    const { data: rows, error } = await context.supabase
      .from("incidents_audit_log")
      .select("id, fire_key, status, dispatched_at")
      .in("fire_key", keys);
    if (error) throw new Error(error.message);
    return { incidents: rows ?? [] };
  });

const UpdateSchema = z
  .object({
    fireKey: z.string().min(1).max(200).optional(),
    id: z.string().uuid().optional(),
    status: z.enum(["active", "dispatched", "resolved", "false_alarm"]).optional(),
    fieldNotes: z.string().max(5000).optional(),
    proofImageUrls: z.array(z.string().min(1).max(500)).max(20).optional(),
  })
  .refine((v) => v.fireKey || v.id, "fireKey or id required");

export const updateIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof UpdateSchema>) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: { status?: string; field_notes?: string; proof_image_urls?: string[] } = {};
    if (data.status) patch.status = data.status;
    if (data.fieldNotes !== undefined) patch.field_notes = data.fieldNotes;
    if (data.proofImageUrls) patch.proof_image_urls = data.proofImageUrls;
    let q = context.supabase.from("incidents_audit_log").update(patch);
    q = data.id ? q.eq("id", data.id) : q.eq("fire_key", data.fireKey!);
    const { data: rows, error } = await q.select("id, fire_key, status, dispatched_at, resolved_at");
    if (error) throw new Error(error.message);
    return { incident: rows?.[0] ?? null };
  });
