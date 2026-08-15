import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchIndustrialAreas } from "./overpass.server";

const InputSchema = z.object({
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
});

export const getIndustrialAreas = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { ok, reason, features } = await fetchIndustrialAreas(
      Math.min(data.south, data.north),
      Math.min(data.west, data.east),
      Math.max(data.south, data.north),
      Math.max(data.west, data.east),
    );
    return { ok, reason: reason ?? null, features };
  });
