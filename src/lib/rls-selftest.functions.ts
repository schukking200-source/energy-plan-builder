import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SelftestResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

type SelftestReport = {
  run_at: string;
  total: number;
  passed: number;
  results: SelftestResult[];
};

export const runRlsSelftest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SelftestReport> => {
    // Caller moet admin zijn
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(`Rolcheck mislukt: ${roleErr.message}`);
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Maak drie tijdelijke testgebruikers
    const stamp = Date.now();
    const mkEmail = (label: string) => `selftest+${label}-${stamp}@example.test`;

    const created: { id: string; role: "adviseur" | "kwaliteitscommissie" | "bewoner" }[] = [];
    try {
      for (const role of ["adviseur", "kwaliteitscommissie", "bewoner"] as const) {
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: mkEmail(role),
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { selftest: true, display_name: `selftest-${role}` },
        });
        if (error || !data.user) throw new Error(`Aanmaak ${role} mislukt: ${error?.message}`);
        created.push({ id: data.user.id, role });

        // Override default 'bewoner' rol uit handle_new_user trigger
        await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user.id);
        const { error: roleInsertErr } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: data.user.id, role });
        if (roleInsertErr) throw new Error(`Rol toekennen mislukt: ${roleInsertErr.message}`);
      }

      const adv = created.find((c) => c.role === "adviseur")!;
      const rev = created.find((c) => c.role === "kwaliteitscommissie")!;
      const res = created.find((c) => c.role === "bewoner")!;

      const { data: report, error: rpcErr } = await context.supabase.rpc("admin_rls_selftest", {
        adv_id: adv.id,
        rev_id: rev.id,
        res_id: res.id,
      });
      if (rpcErr) throw new Error(`Selftest RPC mislukt: ${rpcErr.message}`);

      return report as SelftestReport;
    } finally {
      // Cleanup: verwijder alle testgebruikers (CASCADE ruimt user_roles op)
      for (const u of created) {
        await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => undefined);
      }
    }
  });
