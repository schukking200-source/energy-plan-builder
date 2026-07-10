import { ZodError } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DidCheckRequest,
  OrderCreateRequest,
  PaymentWebhookRequest,
  ProvisionCustomerRequest,
} from "./provisioning.schemas";

type DbError = {
  message: string;
  code?: string;
};

type QueryResult<T> = {
  data: T | null;
  error: DbError | null;
};

type Row = Record<string, unknown>;

type ResolvedProvisioningInput = {
  order_id?: string;
  customer_name: string;
  tenant_code: string;
  did: string;
  extension: string;
  reservation_id?: string;
  plan_code?: string;
  contact_email?: string;
  metadata: Record<string, unknown>;
};

type ProvisioningJob = {
  id: string;
  status: string;
  attempt_count: number;
  result_payload: unknown;
};

type SupabaseQuery<T> = PromiseLike<QueryResult<T[]>> & {
  select: <TNext = Row>(columns?: string) => SupabaseQuery<TNext>;
  insert: (values: unknown, options?: unknown) => SupabaseQuery<T>;
  upsert: (values: unknown, options?: unknown) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  gt: (column: string, value: unknown) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  single: () => Promise<QueryResult<T>>;
  maybeSingle: () => Promise<QueryResult<T | null>>;
};

type SupabaseDb = {
  from: <T = Row>(table: string) => SupabaseQuery<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const COMPLETED_PAYMENT_STATUSES = new Set(["paid", "succeeded", "completed"]);

export class VoipProvisioningError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "VoipProvisioningError";
  }
}

function db(): SupabaseDb {
  return supabaseAdmin as unknown as SupabaseDb;
}

function fail(
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new VoipProvisioningError(status, code, message, details);
}

function assertDbOk<T>(result: QueryResult<T>, message: string): T {
  if (result.error) {
    fail(500, "database_error", `${message}: ${result.error.message}`, {
      supabase_code: result.error.code,
    });
  }
  if (result.data == null) {
    fail(500, "database_empty_result", message);
  }
  return result.data;
}

function stringField(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    fail(500, "database_shape_error", `Expected string field ${field}`);
  }
  return value;
}

function optionalStringField(row: Row, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length);
}

export function requireProvisioningApiKey(request: Request) {
  const expected = process.env.VOIP_PROVISIONING_API_KEY;
  if (!expected) {
    fail(
      503,
      "api_key_not_configured",
      "VOIP_PROVISIONING_API_KEY is required before provisioning endpoints can be used",
    );
  }

  const supplied = request.headers.get("x-api-key") ?? getBearerToken(request);
  if (supplied !== expected) {
    fail(401, "unauthorized", "Invalid provisioning API key");
  }
}

export function requirePaymentWebhookSecret(request: Request) {
  const expected = process.env.VOIP_PAYMENT_WEBHOOK_SECRET;
  if (!expected) {
    fail(
      503,
      "webhook_secret_not_configured",
      "VOIP_PAYMENT_WEBHOOK_SECRET is required before payment webhooks can be used",
    );
  }

  const supplied =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("x-api-key") ??
    getBearerToken(request);
  if (supplied !== expected) {
    fail(401, "unauthorized", "Invalid payment webhook secret");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    fail(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof VoipProvisioningError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "validation_failed",
          message: "Request validation failed",
          issues: error.issues,
        },
      },
      { status: 400 },
    );
  }

  console.error(error);
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Unexpected VoIP provisioning error",
      },
    },
    { status: 500 },
  );
}

export async function checkAndReserveDid(input: DidCheckRequest) {
  const result = await db().rpc<Row>("voip_reserve_did", {
    _did: input.did,
    _trunk: input.trunk,
    _expires_minutes: input.reservation_minutes,
  });

  const reservation = assertDbOk(result, "DID reservation failed");
  await insertAudit("voip.did.checked", "voip.did", input.did, {
    trunk: input.trunk,
    available: reservation.available,
    reservation_id: reservation.reservation_id,
  });

  return reservation;
}

export async function createOrder(input: OrderCreateRequest) {
  const reservation = await getActiveReservation(input.reservation_id, input.did);
  const orderNumber = `ord_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  const orderResult = await db()
    .from<Row>("voip_orders")
    .insert({
      order_number: orderNumber,
      customer_name: input.customer_name,
      tenant_code: input.tenant_code,
      did: input.did,
      extension: input.extension,
      plan_code: input.plan_code,
      reservation_id: reservation.id,
      amount_cents: input.amount_cents,
      currency: input.currency,
      status: "pending_payment",
      metadata: {
        ...input.metadata,
        contact_email: input.contact_email,
      },
    })
    .select<Row>("id, order_number, status, reservation_id")
    .single();

  const order = assertDbOk(orderResult, "Order creation failed");

  await assertDbMutation(
    db().from("voip_did_reservations").update({ order_id: order.id }).eq("id", reservation.id),
    "Reservation could not be linked to order",
  );

  await insertAudit("voip.order.created", "voip.order", stringField(order, "id"), {
    order_number: order.order_number,
    did: input.did,
    tenant_code: input.tenant_code,
  });

  return {
    order_id: stringField(order, "id"),
    order_number: stringField(order, "order_number"),
    status: stringField(order, "status"),
    payment_required: true,
  };
}

export async function handlePaymentWebhook(input: PaymentWebhookRequest) {
  const existingEvent = await db()
    .from<Row>("voip_payment_events")
    .select<Row>("id, status")
    .eq("provider", input.provider)
    .eq("provider_event_id", input.event_id)
    .maybeSingle();

  if (existingEvent.error) {
    fail(500, "database_error", `Payment event lookup failed: ${existingEvent.error.message}`);
  }

  if (existingEvent.data) {
    return {
      duplicate: true,
      event_id: stringField(existingEvent.data, "id"),
      status: stringField(existingEvent.data, "status"),
    };
  }

  const order = await findOrderForPayment(input);
  const paymentEvent = assertDbOk(
    await db()
      .from<Row>("voip_payment_events")
      .insert({
        provider: input.provider,
        provider_event_id: input.event_id,
        order_id: order?.id,
        status: "received",
        payload: input.payload,
      })
      .select<Row>("id")
      .single(),
    "Payment event creation failed",
  );

  if (!order) {
    await markPaymentEvent(stringField(paymentEvent, "id"), "ignored", "Order not found");
    return {
      event_id: stringField(paymentEvent, "id"),
      status: "ignored",
      provisioning_started: false,
    };
  }

  if (!COMPLETED_PAYMENT_STATUSES.has(input.status)) {
    await assertDbMutation(
      db()
        .from("voip_orders")
        .update({ status: input.status === "failed" ? "failed" : "cancelled" })
        .eq("id", order.id),
      "Order payment status update failed",
    );
    await markPaymentEvent(stringField(paymentEvent, "id"), "processed");
    return {
      event_id: stringField(paymentEvent, "id"),
      order_id: order.id,
      status: "processed",
      provisioning_started: false,
    };
  }

  await assertDbMutation(
    db()
      .from("voip_orders")
      .update({
        status: "paid",
        payment_provider: input.provider,
        payment_reference: input.payment_reference ?? input.event_id,
      })
      .eq("id", order.id),
    "Order paid update failed",
  );

  const provisioning = await runProvisioning({
    order_id: order.id,
    metadata: { trigger: "payment_webhook", payment_event_id: stringField(paymentEvent, "id") },
  });
  await markPaymentEvent(stringField(paymentEvent, "id"), "processed");

  return {
    event_id: stringField(paymentEvent, "id"),
    order_id: order.id,
    status: "processed",
    provisioning_started: true,
    provisioning,
  };
}

export async function provisionCustomer(input: ProvisionCustomerRequest) {
  return runProvisioning(input);
}

async function runProvisioning(input: ProvisionCustomerRequest) {
  const provisionInput = await resolveProvisioningInput(input);
  const idempotencyKey = provisionInput.order_id
    ? `order:${provisionInput.order_id}`
    : `direct:${provisionInput.tenant_code}:${provisionInput.did}:${provisionInput.extension}`;
  const job = await getOrCreateProvisioningJob(idempotencyKey, provisionInput);
  const jobId = job.id;

  if (job.status === "success") {
    return {
      job_id: jobId,
      status: job.status,
      already_completed: true,
      result: job.result_payload,
    };
  }

  await updateJob(jobId, {
    status: "running",
    current_step: "tenant",
    attempt_count: Number(job.attempt_count ?? 0) + 1,
    locked_at: new Date().toISOString(),
    error_message: null,
  });

  try {
    await logStep(jobId, "tenant", "running", "Tenant provisioning started");
    const customer = await upsertCustomer(provisionInput);
    const tenant = await upsertTenant(customer.id, provisionInput);
    await logStep(jobId, "tenant", "success", "Tenant available", {
      customer_id: customer.id,
      tenant_id: tenant.id,
    });

    if (provisionInput.plan_code) {
      await logStep(jobId, "subscription", "running", "Subscription provisioning started");
      await createSubscription(customer.id, provisionInput.plan_code);
      await logStep(jobId, "subscription", "success", "Subscription available");
    }

    await logStep(jobId, "sip_account", "running", "SIP account provisioning started");
    const sipAccount = await upsertSipAccount(tenant.id, provisionInput.extension);
    await logStep(jobId, "sip_account", "success", "SIP account available", {
      sip_account_id: sipAccount.id,
      username: sipAccount.username,
      password_generated: Boolean(sipAccount.password),
    });

    await logStep(jobId, "did_route", "running", "DID assignment started");
    await assignDid(provisionInput, tenant.id, sipAccount.id);
    await logStep(jobId, "did_route", "success", "DID assigned", {
      did: provisionInput.did,
      tenant_id: tenant.id,
    });

    await runIntegrationStep(jobId, "kamailio", {
      route: `${provisionInput.did} -> dispatcher-group:freeswitch-active`,
      tenant_code: provisionInput.tenant_code,
    });
    await runIntegrationStep(jobId, "freeswitch", {
      action: "generate_directory_dialplan_reloadxml",
      extension: provisionInput.extension,
      tenant_code: provisionInput.tenant_code,
    });
    await runIntegrationStep(jobId, "sippysoft", {
      action: "activate_incoming_route",
      did: provisionInput.did,
      trunk: "AMS",
    });
    await runIntegrationStep(jobId, "health_check", {
      checks: [
        "sip_registration",
        "did_route",
        "kamailio_route",
        "freeswitch_route",
        "sippysoft_route",
      ],
    });

    if (provisionInput.order_id) {
      await assertDbMutation(
        db()
          .from("voip_orders")
          .update({ status: "active", customer_id: customer.id })
          .eq("id", provisionInput.order_id),
        "Order activation failed",
      );
    }

    const resultPayload = {
      customer_id: customer.id,
      tenant_id: tenant.id,
      sip_account_id: sipAccount.id,
      did: provisionInput.did,
      sip_credentials: {
        username: sipAccount.username,
        extension: provisionInput.extension,
        password: sipAccount.password,
        password_returned_once: Boolean(sipAccount.password),
      },
      integration_mode: integrationMode(),
    };

    await updateJob(jobId, {
      status: "success",
      current_step: "completed",
      result_payload: resultPayload,
      completed_at: new Date().toISOString(),
      locked_at: null,
    });
    await insertAudit("voip.provisioning.success", "voip.provisioning_job", jobId, resultPayload);

    return {
      job_id: jobId,
      status: "success",
      result: resultPayload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provisioning error";
    await updateJob(jobId, {
      status: "failed",
      current_step: "failed",
      error_message: message,
      locked_at: null,
    });
    await logStep(jobId, "provisioning", "failed", message);
    await insertAudit("voip.provisioning.failed", "voip.provisioning_job", jobId, {
      error: message,
    });
    throw error;
  }
}

async function resolveProvisioningInput(
  input: ProvisionCustomerRequest,
): Promise<ResolvedProvisioningInput> {
  if (input.order_id) {
    const order = assertDbOk(
      await db()
        .from<Row>("voip_orders")
        .select<Row>(
          "id, customer_name, tenant_code, did, extension, plan_code, reservation_id, status, metadata",
        )
        .eq("id", input.order_id)
        .single(),
      "Order not found",
    );

    const metadata = recordValue(order.metadata);
    return {
      order_id: stringField(order, "id"),
      customer_name: stringField(order, "customer_name"),
      tenant_code: stringField(order, "tenant_code"),
      did: stringField(order, "did"),
      extension: stringField(order, "extension"),
      reservation_id: optionalStringField(order, "reservation_id"),
      plan_code: optionalStringField(order, "plan_code"),
      contact_email:
        typeof metadata.contact_email === "string" ? metadata.contact_email : undefined,
      metadata: {
        ...metadata,
        ...input.metadata,
      },
    };
  }

  if (!input.customer_name || !input.tenant_code || !input.did || !input.extension) {
    fail(
      400,
      "missing_provisioning_fields",
      "customer_name, tenant_code, did and extension are required when order_id is omitted",
    );
  }

  return {
    order_id: undefined,
    customer_name: input.customer_name,
    tenant_code: input.tenant_code,
    did: input.did,
    extension: input.extension,
    reservation_id: input.reservation_id,
    plan_code: input.plan_code,
    contact_email: input.contact_email,
    metadata: input.metadata,
  };
}

async function getActiveReservation(reservationToken: string, did: string) {
  const reservation = assertDbOk(
    await db()
      .from<Row>("voip_did_reservations")
      .select<Row>("id, did_number_id, status, expires_at")
      .eq("reservation_token", reservationToken)
      .single(),
    "DID reservation not found",
  );

  if (reservation.status !== "active") {
    fail(409, "reservation_not_active", "DID reservation is not active");
  }

  const expiresAt = stringField(reservation, "expires_at");
  if (new Date(expiresAt).getTime() <= Date.now()) {
    fail(409, "reservation_expired", "DID reservation has expired");
  }

  const didNumber = assertDbOk(
    await db()
      .from<Row>("voip_did_numbers")
      .select<Row>("did")
      .eq("id", reservation.did_number_id)
      .single(),
    "Reserved DID lookup failed",
  );

  if (didNumber.did !== did) {
    fail(409, "reservation_did_mismatch", "Reservation does not belong to requested DID");
  }

  return {
    id: stringField(reservation, "id"),
    did_number_id: stringField(reservation, "did_number_id"),
  };
}

async function findOrderForPayment(input: PaymentWebhookRequest): Promise<{ id: string } | null> {
  if (input.order_id) {
    const result = await db()
      .from<Row>("voip_orders")
      .select<Row>("id")
      .eq("id", input.order_id)
      .maybeSingle();
    if (result.error) fail(500, "database_error", `Order lookup failed: ${result.error.message}`);
    return result.data ? { id: stringField(result.data, "id") } : null;
  }

  if (input.order_number) {
    const result = await db()
      .from<Row>("voip_orders")
      .select<Row>("id")
      .eq("order_number", input.order_number)
      .maybeSingle();
    if (result.error) fail(500, "database_error", `Order lookup failed: ${result.error.message}`);
    return result.data ? { id: stringField(result.data, "id") } : null;
  }

  return null;
}

async function getOrCreateProvisioningJob(
  idempotencyKey: string,
  input: Record<string, unknown>,
): Promise<ProvisioningJob> {
  const existing = await db()
    .from<Row>("voip_provisioning_jobs")
    .select<Row>("id, status, attempt_count, result_payload")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    fail(500, "database_error", `Provisioning job lookup failed: ${existing.error.message}`);
  }
  if (existing.data) {
    return toProvisioningJob(existing.data);
  }

  const inserted = await db()
    .from<Row>("voip_provisioning_jobs")
    .insert({
      idempotency_key: idempotencyKey,
      order_id: typeof input.order_id === "string" ? input.order_id : null,
      status: "queued",
      input_payload: input,
    })
    .select<Row>("id, status, attempt_count, result_payload")
    .single();

  return toProvisioningJob(assertDbOk(inserted, "Provisioning job creation failed"));
}

function toProvisioningJob(row: Row): ProvisioningJob {
  const attemptCount = row.attempt_count;
  return {
    id: stringField(row, "id"),
    status: stringField(row, "status"),
    attempt_count: typeof attemptCount === "number" ? attemptCount : 0,
    result_payload: row.result_payload,
  };
}

async function upsertCustomer(input: {
  customer_name: string;
  tenant_code: string;
  contact_email?: string;
  metadata: Record<string, unknown>;
}) {
  const result = await db()
    .from<Row>("voip_customers")
    .upsert(
      {
        customer_name: input.customer_name,
        customer_code: input.tenant_code,
        contact_email: input.contact_email,
        metadata: input.metadata,
      },
      { onConflict: "customer_code" },
    )
    .select<Row>("id")
    .single();

  return { id: stringField(assertDbOk(result, "Customer upsert failed"), "id") };
}

async function upsertTenant(
  customerId: string,
  input: {
    tenant_code: string;
    metadata: Record<string, unknown>;
  },
) {
  const result = await db()
    .from<Row>("voip_tenants")
    .upsert(
      {
        customer_id: customerId,
        tenant_code: input.tenant_code,
        routing_profile: "carrier-ha",
        default_settings: {
          kamailio_dispatcher_group: "freeswitch-active",
          freeswitch_cluster: ["media-ams", "media-rtd"],
          ...recordValue(input.metadata.default_settings),
        },
      },
      { onConflict: "tenant_code" },
    )
    .select<Row>("id")
    .single();

  return { id: stringField(assertDbOk(result, "Tenant upsert failed"), "id") };
}

async function createSubscription(customerId: string, planCode: string) {
  const existing = await db()
    .from<Row>("voip_subscriptions")
    .select<Row>("id")
    .eq("customer_id", customerId)
    .eq("plan_code", planCode)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    fail(500, "database_error", `Subscription lookup failed: ${existing.error.message}`);
  }
  if (existing.data) return;

  await assertDbMutation(
    db().from("voip_subscriptions").insert({
      customer_id: customerId,
      plan_code: planCode,
      status: "active",
    }),
    "Subscription creation failed",
  );
}

async function upsertSipAccount(tenantId: string, extension: string) {
  const existing = await db()
    .from<Row>("voip_sip_accounts")
    .select<Row>("id, username")
    .eq("tenant_id", tenantId)
    .eq("extension", extension)
    .maybeSingle();

  if (existing.error) {
    fail(500, "database_error", `SIP account lookup failed: ${existing.error.message}`);
  }

  if (existing.data) {
    return {
      id: stringField(existing.data, "id"),
      username: stringField(existing.data, "username"),
      password: undefined,
    };
  }

  const password = generatePassword();
  const username = extension;
  const inserted = await db()
    .from<Row>("voip_sip_accounts")
    .insert({
      tenant_id: tenantId,
      extension,
      username,
      password_hash: await sha256Password(password),
      password_secret_ref: `voip/sip/${tenantId}/${extension}`,
      status: "active",
    })
    .select<Row>("id, username")
    .single();

  const sipAccount = assertDbOk(inserted, "SIP account creation failed");
  return {
    id: stringField(sipAccount, "id"),
    username: stringField(sipAccount, "username"),
    password,
  };
}

async function assignDid(
  input: {
    did: string;
    reservation_id?: string;
  },
  tenantId: string,
  sipAccountId: string,
) {
  const existing = await db()
    .from<Row>("voip_did_numbers")
    .select<Row>("id, status, assigned_tenant_id")
    .eq("did", input.did)
    .maybeSingle();

  if (existing.error) {
    fail(500, "database_error", `DID lookup failed: ${existing.error.message}`);
  }

  if (existing.data?.status === "assigned" && existing.data.assigned_tenant_id !== tenantId) {
    fail(409, "did_already_assigned", "DID is already assigned to another tenant");
  }

  const didNumberId = existing.data
    ? stringField(existing.data, "id")
    : stringField(
        assertDbOk(
          await db()
            .from<Row>("voip_did_numbers")
            .insert({ did: input.did, trunk: "AMS", status: "available" })
            .select<Row>("id")
            .single(),
          "DID creation failed",
        ),
        "id",
      );

  await assertDbMutation(
    db()
      .from("voip_did_numbers")
      .update({
        status: "assigned",
        assigned_tenant_id: tenantId,
        assigned_sip_account_id: sipAccountId,
        assigned_at: new Date().toISOString(),
      })
      .eq("id", didNumberId),
    "DID assignment failed",
  );

  if (input.reservation_id) {
    const reservationColumn = isUuid(input.reservation_id) ? "id" : "reservation_token";
    await assertDbMutation(
      db()
        .from("voip_did_reservations")
        .update({ status: "converted" })
        .eq(reservationColumn, input.reservation_id),
      "DID reservation conversion failed",
    );
  }
}

async function runIntegrationStep(jobId: string, step: string, details: Record<string, unknown>) {
  await logStep(jobId, step, "running", `${step} integration step started`, {
    ...details,
    integration_mode: integrationMode(),
  });

  if (integrationMode() === "live") {
    fail(
      501,
      "live_integration_not_implemented",
      `${step} live integration is not implemented in this repository yet`,
      { step },
    );
  }

  await logStep(jobId, step, "success", `${step} integration stub completed`, {
    ...details,
    integration_mode: "stub",
  });
}

function integrationMode() {
  return process.env.VOIP_INTEGRATION_MODE === "live" ? "live" : "stub";
}

async function logStep(
  jobId: string,
  step: string,
  status: "queued" | "running" | "success" | "failed" | "skipped",
  message: string,
  details: Record<string, unknown> = {},
) {
  await assertDbMutation(
    db().from("voip_provisioning_logs").insert({
      job_id: jobId,
      step,
      status,
      message,
      details,
    }),
    `Provisioning log insert failed for ${step}`,
  );
}

async function updateJob(jobId: string, values: Record<string, unknown>) {
  await assertDbMutation(
    db().from("voip_provisioning_jobs").update(values).eq("id", jobId),
    "Provisioning job update failed",
  );
}

async function markPaymentEvent(
  id: string,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string,
) {
  await assertDbMutation(
    db()
      .from("voip_payment_events")
      .update({
        status,
        processed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", id),
    "Payment event update failed",
  );
}

async function assertDbMutation(query: PromiseLike<QueryResult<unknown[]>>, message: string) {
  const result = await query;
  if (result.error) {
    fail(500, "database_error", `${message}: ${result.error.message}`, {
      supabase_code: result.error.code,
    });
  }
}

async function insertAudit(
  action: string,
  resourceType: string,
  resourceId: string | undefined,
  payload: Record<string, unknown>,
) {
  await assertDbMutation(
    db()
      .from("aud_events")
      .insert({
        actor_id: null,
        action,
        resource_type: resourceType,
        resource_id: resourceId ?? null,
        payload,
      }),
    "Audit insert failed",
  );
}

function generatePassword(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function sha256Password(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hash}`;
}
