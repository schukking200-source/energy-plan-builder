import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyRoles } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard/steekproef")({
  head: () => ({ meta: [{ title: "Steekproef — Isolatieplan Tool" }] }),
  component: SteekproefDashboard,
});

function SteekproefDashboard() {
  const { roles, loading } = useMyRoles();
  const allowed = !loading && (roles?.includes("steekproef") || roles?.includes("admin"));

  return (
    <AppShell>
      {!allowed && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Geen toegang</CardTitle>
            <CardDescription>Alleen steekproefcontroleurs hebben toegang.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Willekeurige steekproef</CardTitle>
              <CardDescription>Komt in Fase 6 — Scenario D (hercontrole).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Hier wordt een configureerbaar percentage van ingediende plannen automatisch
              geselecteerd voor controle. Verschilanalyse D vs C en herstelpunten landen
              vervolgens in het append-only audit-log.
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
