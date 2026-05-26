import { createServerFn } from "@tanstack/react-start";
import { diagnoseGee, fetchActiveFires, getProjectId } from "./gee.server";

export const getGeeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const diag = await diagnoseGee();
  return { ...diag, projectIdFromEnv: getProjectId() };
});

export const getActiveFires = createServerFn({ method: "GET" }).handler(async () => {
  const data = await fetchActiveFires(24);
  return { fires: data ?? [], live: data !== null };
});
