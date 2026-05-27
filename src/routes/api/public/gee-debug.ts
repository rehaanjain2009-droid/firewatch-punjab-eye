import { createFileRoute } from "@tanstack/react-router";
import { diagnoseGee, fetchActiveFires, fetchTileLayers } from "@/lib/gee.server";

export const Route = createFileRoute("/api/public/gee-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
