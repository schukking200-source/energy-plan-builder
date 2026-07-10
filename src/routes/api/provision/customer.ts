import { createFileRoute } from "@tanstack/react-router";

import { provisionCustomerRequestSchema } from "@/lib/voip/provisioning.schemas";

export const Route = createFileRoute("/api/provision/customer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provisioning = await import("@/lib/voip/provisioning.server");
        try {
          provisioning.requireProvisioningApiKey(request);
          const body = await provisioning.readJson(request);
          const input = provisionCustomerRequestSchema.parse(body);
          const result = await provisioning.provisionCustomer(input);
          return Response.json(result);
        } catch (error) {
          return provisioning.errorResponse(error);
        }
      },
    },
  },
});
