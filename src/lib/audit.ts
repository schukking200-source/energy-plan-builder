import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "role.viewed_dashboard"
  | "profile.updated";

export async function logAudit(
  action: AuditAction | string,
  resource_type: string,
  resource_id: string | null = null,
  payload: Record<string, unknown> = {}
) {
  const { data: userData } = await supabase.auth.getUser();
  const actor_id = userData.user?.id ?? null;
  // record_hash + prev_hash worden door de BEFORE INSERT trigger gevuld; cast om de
  // strikte generated-types check te omzeilen.
  await (supabase.from("aud_events") as unknown as {
    insert: (row: Record<string, unknown>) => Promise<unknown>;
  }).insert({
    actor_id,
    action,
    resource_type,
    resource_id,
    payload,
  });
}
