import { createServerFn } from "@tanstack/react-start";
import { fetchActiveFires, getAccessToken, getProjectId } from "./gee.server";

export const getGeeStatus = createServerFn({ method: "GET" }).handler(async () => {
  const project = getProjectId();
  if (!project) return { configured: false as const, reason: "GEE_SERVICE_ACCOUNT_JSON / GEE_PROJECT_ID not set" };
  const token = await getAccessToken();
  return { configured: Boolean(token), project, reason: token ? null : "Token exchange failed" };
});

export const getActiveFires = createServerFn({ method: "GET" }).handler(async () => {
  const data = await fetchActiveFires(24);
  return { fires: data ?? [], live: data !== null };
});
