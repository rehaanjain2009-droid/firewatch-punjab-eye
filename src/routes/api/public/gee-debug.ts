import { createFileRoute } from "@tanstack/react-router";
import { diagnoseGee, fetchActiveFires, fetchActiveFiresVerbose } from "@/lib/gee.server";

export const Route = createFileRoute("/api/public/gee-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("fires") === "1") {
          const v = await fetchActiveFiresVerbose(24);
          return new Response(JSON.stringify(v, null, 2), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const d = await diagnoseGee();
        return new Response(JSON.stringify(d, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
