import { createFileRoute } from "@tanstack/react-router";
import { diagnoseGee } from "@/lib/gee.server";

export const Route = createFileRoute("/api/public/gee-debug")({
  server: {
    handlers: {
      GET: async () => {
        const d = await diagnoseGee();
        return new Response(JSON.stringify(d, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
