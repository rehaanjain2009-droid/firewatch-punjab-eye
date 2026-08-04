import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reverseGeocodePoints } from "./geocode.server";

const PointSchema = z.object({
  id: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const InputSchema = z.object({ points: z.array(PointSchema).max(60) });

export const geocodeFires = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.points.length === 0) return { ok: true, places: [] };
    const places = await reverseGeocodePoints(data.points);
    return { ok: true, places };
  });
