import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, useMyRoles, type AppRole } from "@/lib/roles";
import { Home, ClipboardCheck, ShieldCheck, Dice5, LogOut, AlertTriangle, ClipboardList } from "lucide-react";

const NAV: Array<{ to: string; label: string; icon: typeof Home; role: AppRole | null }> = [
  { to: "/dashboard", label: "Mijn dossier", icon: Home, role: "bewoner" },
  { to: "/intake", label: "Opnames", icon: ClipboardList, role: "adviseur" },
  { to: "/dashboard/adviseur", label: "Adviseur", icon: ClipboardCheck, role: "adviseur" },
  { to: "/dashboard/kwaliteit", label: "Kwaliteitscommissie", icon: ShieldCheck, role: "kwaliteitscommissie" },
  { to: "/dashboard/steekproef", label: "Steekproef", icon: Dice5, role: "steekproef" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { roles } = useMyRoles();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const visible = NAV.filter(
    (item) => !item.role || (roles ?? []).includes(item.role) || (roles ?? []).includes("admin")
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="font-semibold">
              Isolatieplan Tool
            </Link>
            <Badge variant="secondary" className="text-xs">MVP 0 — blueprint</Badge>
          </div>
          <div className="flex items-center gap-2">
            {(roles ?? []).map((r) => (
              <Badge key={r} variant="outline" className="text-xs">{ROLE_LABELS[r]}</Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" /> Uitloggen
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          {visible.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Dit is <strong>MVP 0 / functionele blueprint</strong>. Berekeningen zijn indicatief en
            niet NTA 8800-gecertificeerd. Gebruik geen echte persoonsgegevens.
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
