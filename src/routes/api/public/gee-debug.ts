import { createFileRoute } from "@tanstack/react-router";
import { diagnoseGee, fetchActiveFires, fetchTileLayers } from "@/lib/gee.server";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("secret") ??
    request.headers.get("x-debug-secret") ??
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!provided && provided === secret;
}

export const Route = createFileRoute("/api/public/gee-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const url = new URL(request.url);
        const mode = url.searchParams.get("mode");
        let body: unknown;
        if (mode === "fires") body = await fetchActiveFires(1);
        else if (mode === "tiles") body = await fetchTileLayers();
        else body = await diagnoseGee();
        return new Response(JSON.stringify(body, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
