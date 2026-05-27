import { createServerFn } from "@tanstack/react-start";
import { diagnoseGee, fetchActiveFires, fetchTileLayers, getProjectId } from "./gee.server";

export const getGeeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const diag = await diagnoseGee();
  return { ...diag, projectIdFromEnv: getProjectId() };
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
