import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "bewoner"
  | "adviseur"
  | "adviesbureau_admin"
  | "kwaliteitscommissie"
  | "steekproef"
  | "admin";

export const ROLE_LABELS: Record<AppRole, string> = {
  bewoner: "Woningeigenaar",
  adviseur: "Adviseur",
  adviesbureau_admin: "Adviesbureau-admin",
  kwaliteitscommissie: "Kwaliteitscommissie",
  steekproef: "Steekproefcontroleur",
  admin: "Beheerder",
};

export function useMyRoles() {
  const [roles, setRoles] = useState<AppRole[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (!cancelled) {
          setRoles([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      if (!cancelled) {
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { roles, loading };
}
