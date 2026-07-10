import { createFileRoute } from "@tanstack/react-router";

import { orderCreateRequestSchema } from "@/lib/voip/provisioning.schemas";

export const Route = createFileRoute("/api/order/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provisioning = await import("@/lib/voip/provisioning.server");
        try {
          provisioning.requireProvisioningApiKey(request);
          const body = await provisioning.readJson(request);
          const input = orderCreateRequestSchema.parse(body);
          const result = await provisioning.createOrder(input);
          return Response.json(result, { status: 201 });
        } catch (error) {
          return provisioning.errorResponse(error);
        }
      },
    },
  },
});
