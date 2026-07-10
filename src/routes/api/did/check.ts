import { createFileRoute } from "@tanstack/react-router";

import { didCheckRequestSchema } from "@/lib/voip/provisioning.schemas";

export const Route = createFileRoute("/api/did/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provisioning = await import("@/lib/voip/provisioning.server");
        try {
          provisioning.requireProvisioningApiKey(request);
          const body = await provisioning.readJson(request);
          const input = didCheckRequestSchema.parse(body);
          const result = await provisioning.checkAndReserveDid(input);
          return Response.json(result);
        } catch (error) {
          return provisioning.errorResponse(error);
        }
      },
    },
  },
});
