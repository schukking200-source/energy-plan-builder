import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyRoles } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard/kwaliteit")({
  head: () => ({ meta: [{ title: "Kwaliteitscommissie — Isolatieplan Tool" }] }),
  component: KwaliteitDashboard,
});

function KwaliteitDashboard() {
  const { roles, loading } = useMyRoles();
  const allowed = !loading && (roles?.includes("kwaliteitscommissie") || roles?.includes("admin"));

  return (
    <AppShell>
      {!allowed && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Geen toegang</CardTitle>
            <CardDescription>Alleen leden van de kwaliteitscommissie (NijBegun) hebben toegang.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Review-queue</CardTitle>
              <CardDescription>Komt in Fase 5 + 6.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Hier verschijnen ingediende isolatieplannen ter beoordeling, met per plan een
              overzicht van de M29-regelcheck (uitlegbare regelbesluiten) en de mogelijkheid
              om goed te keuren, af te wijzen of een wijzigingsverzoek te sturen.
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
