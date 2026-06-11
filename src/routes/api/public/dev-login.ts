// PUBLIC dev endpoint: creates an all-roles dev user on demand.
// ⚠️ Verwijder dit bestand voordat je naar productie gaat.
import { createFileRoute } from "@tanstack/react-router";

const DEV_EMAIL = "dev@local.test";
const DEV_PASSWORD = "dev-quick-login-2026";

export const Route = createFileRoute("/api/public/dev-login")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Maak gebruiker aan (idempotent: negeer "already registered")
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: DEV_EMAIL,
          password: DEV_PASSWORD,
          email_confirm: true,
          user_metadata: { display_name: "Dev User" },
        });

        let userId = created?.user?.id;
        if (createErr && !/registered|exists/i.test(createErr.message)) {
          return Response.json({ error: createErr.message }, { status: 500 });
        }
        if (!userId) {
          // Bestaat al: zoek op
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          userId = list?.users.find((u) => u.email === DEV_EMAIL)?.id;
          // Reset password zodat onze bekende waarde altijd werkt
          if (userId) {
            await supabaseAdmin.auth.admin.updateUserById(userId, { password: DEV_PASSWORD });
          }
        }
        if (!userId) {
          return Response.json({ error: "Kon dev user niet vinden of aanmaken" }, { status: 500 });
        }

        // 2. Ken alle rollen toe
        const roles = ["bewoner", "adviseur", "kwaliteitscommissie", "steekproef", "admin"] as const;
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        await supabaseAdmin
          .from("user_roles")
          .insert(roles.map((r) => ({ user_id: userId!, role: r })));

        return Response.json({ email: DEV_EMAIL, password: DEV_PASSWORD });
      },
    },
  },
});
