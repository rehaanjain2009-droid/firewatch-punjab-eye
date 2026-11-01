import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyseBurnScar, METHOD, toVerificationRow } from "./burnScar.server";
import { incidentKey } from "./officerMatch";

const Input = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  acqDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acqTime: z.string().max(8),
  satellite: z.string().min(1).max(60),
});

/** Run a fresh Sentinel-2 ΔNBR audit for one incident and store it as an evidence record. */
export const verifyBurnScar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof Input>) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const fireKey = incidentKey(data);
    try {
      const result = await analyseBurnScar({ lat: data.lat, lng: data.lng, acqDate: data.acqDate, withThumbnails: true });
      const { data: row, error } = await context.supabase
        .from("burn_scar_verifications")
        .insert({ ...toVerificationRow(fireKey, data, result, "manual"), verified_by: context.userId })
        .select("id, created_at")
        .single();
      if (error) console.error("[burnscar] could not store verification:", error.message);
      const email = typeof context.claims?.email === "string" ? context.claims.email : null;
      return {
        ok: true as const,
        fireKey,
        result,
        method: METHOD,
        recordId: row?.id ?? null,
        recordedAt: row?.created_at ?? new Date().toISOString(),
        verifiedBy: email,
      };
    } catch (err) {
      console.error("[burnscar] analysis failed:", err);
      return { ok: false as const, fireKey, error: "Sentinel-2 analysis is unavailable right now. Please try again in a minute." };
    }
  });
