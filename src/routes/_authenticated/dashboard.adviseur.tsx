import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMyRoles } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard/adviseur")({
  head: () => ({ meta: [{ title: "Adviseur — Isolatieplan Tool" }] }),
  component: AdviseurDashboard,
});

function AdviseurDashboard() {
  const { roles, loading } = useMyRoles();
  const allowed = !loading && (roles?.includes("adviseur") || roles?.includes("adviesbureau_admin") || roles?.includes("admin"));

  return (
    <AppShell>
      {!allowed && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle>Geen toegang</CardTitle>
            <CardDescription>Deze module is beschikbaar voor adviseurs en adviesbureau-admins.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Toegewezen opnames</CardTitle>
              <CardDescription>Komt in Fase 2 + 3 — BAG-objecten en opnameformulier.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Hier komt straks de lijst met aan jou toegewezen woningen, inclusief geplande
              opname-datum en status van het isolatieplan.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Opnameformulier (web)</CardTitle>
              <CardDescription>Fase 3 — ISSO-protocol, bronstatus + bewijskracht per veld.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Web-PWA versie van het opnameformulier. <strong>Native iPad-app met LiDAR/RoomPlan
              en offline-sync valt buiten Lovable-scope</strong> en wordt door een native team
              op dezelfde API gebouwd.
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
