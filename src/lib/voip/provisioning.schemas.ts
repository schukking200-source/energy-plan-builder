import { z } from "zod";

const didSchema = z.string().regex(/^[0-9]{8,15}$/, "DID must contain 8 to 15 digits");
const tenantCodeSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, "Use lowercase letters, numbers and hyphens");
const extensionSchema = z.string().regex(/^[0-9]{2,10}$/, "Extension must contain 2 to 10 digits");

export const didCheckRequestSchema = z.object({
  did: didSchema,
  trunk: z.string().min(1).max(32).default("AMS"),
  reservation_minutes: z.number().int().min(1).max(60).default(15),
});

export const orderCreateRequestSchema = z.object({
  customer_name: z.string().min(1).max(200),
  tenant_code: tenantCodeSchema,
  did: didSchema,
  extension: extensionSchema,
  reservation_id: z.string().min(1),
  plan_code: z.string().min(1).max(80).optional(),
  contact_email: z.string().email().optional(),
  amount_cents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default("EUR"),
  metadata: z.record(z.unknown()).default({}),
});

export const paymentWebhookRequestSchema = z.object({
  provider: z.string().min(1).max(80),
  event_id: z.string().min(1).max(160),
  order_id: z.string().uuid().optional(),
  order_number: z.string().min(1).max(80).optional(),
  payment_reference: z.string().min(1).max(160).optional(),
  status: z.enum(["paid", "succeeded", "completed", "failed", "cancelled", "expired"]),
  payload: z.record(z.unknown()).default({}),
});

export const provisionCustomerRequestSchema = z.object({
  order_id: z.string().uuid().optional(),
  customer_name: z.string().min(1).max(200).optional(),
  tenant_code: tenantCodeSchema.optional(),
  did: didSchema.optional(),
  extension: extensionSchema.optional(),
  reservation_id: z.string().min(1).optional(),
  plan_code: z.string().min(1).max(80).optional(),
  contact_email: z.string().email().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type DidCheckRequest = z.infer<typeof didCheckRequestSchema>;
export type OrderCreateRequest = z.infer<typeof orderCreateRequestSchema>;
export type PaymentWebhookRequest = z.infer<typeof paymentWebhookRequestSchema>;
export type ProvisionCustomerRequest = z.infer<typeof provisionCustomerRequestSchema>;
