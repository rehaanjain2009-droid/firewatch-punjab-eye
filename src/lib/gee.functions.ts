import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { diagnoseGee, fetchActiveFires, fetchTileLayers } from "./gee.server";
import { dispatchIncident, loadOfficerDirectory } from "./incidents.server";

export const getGeeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const diag = await diagnoseGee();
  // Strip sensitive infrastructure details before returning to the browser.
  return {
    ok: diag.ok,
    step: diag.step,
    message: diag.message,
    httpStatus: diag.httpStatus,
  };
});

export const getActiveFires = createServerFn({ method: "GET" }).handler(async () => {
  const data = await fetchActiveFires(1);
  if (!data) return { fires: [], source: "none", live: false };
  return { fires: data.fires, source: data.source, live: true };
});

export const getTileLayers = createServerFn({ method: "GET" }).handler(async () => {
  const layers = await fetchTileLayers();
  return { layers: layers ?? [], live: !!layers && layers.length > 0 };
});

const DispatchSchema = z.object({
  block: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(100),
  frp: z.number().min(0).max(100000),
  acqDate: z.string().min(1).max(20),
  acqTime: z.string().max(8),
  satellite: z.string().min(1).max(60),
  daynight: z.string().max(2).optional(),
  channel: z.enum(["manual", "auto_dashboard"]).default("manual"),
  /** Manual "Force" re-sends even if the incident was already dispatched. */
  force: z.boolean().default(false),
});

export const dispatchTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DispatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { channel, force, ...fire } = data;
    const directory = await loadOfficerDirectory(context.supabase);
    return dispatchIncident(context.supabase, fire, channel, force, directory);
  });
