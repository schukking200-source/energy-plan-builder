import { createFileRoute } from "@tanstack/react-router";

import { paymentWebhookRequestSchema } from "@/lib/voip/provisioning.schemas";

export const Route = createFileRoute("/api/payment/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provisioning = await import("@/lib/voip/provisioning.server");
        try {
          provisioning.requirePaymentWebhookSecret(request);
          const body = await provisioning.readJson(request);
          const input = paymentWebhookRequestSchema.parse(body);
          const result = await provisioning.handlePaymentWebhook(input);
          return Response.json(result);
        } catch (error) {
          return provisioning.errorResponse(error);
        }
      },
    },
  },
});
