import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMyRoles } from "@/lib/roles";
import { runRlsSelftest } from "@/lib/rls-selftest.functions";
import { CheckCircle2, XCircle, PlayCircle, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/rls-tests")({
  component: RlsTestsPage,
});

function RlsTestsPage() {
  const { roles, loading } = useMyRoles();
  const fn = useServerFn(runRlsSelftest);
  const mutation = useMutation({ mutationFn: () => fn() });

  const isAdmin = (roles ?? []).includes("admin");

  if (loading) return <AppShell><p>Laden…</p></AppShell>;
  if (!isAdmin) {
    return (
      <AppShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Alleen voor admins
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Deze pagina is voorbehouden aan beheerders.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const report = mutation.data;
  const allGreen = report && report.passed === report.total;

  return (
    <AppShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">RLS Self-test</h1>
          <p className="text-sm text-muted-foreground">
            Voert geautomatiseerde rol-gebaseerde toegangstests uit op{" "}
            <code>in_measurement</code>. Tijdelijke testgebruikers worden aangemaakt en na afloop
            opgeruimd; testdata wordt teruggedraaid.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              <PlayCircle className="mr-2 h-4 w-4" />
              {mutation.isPending ? "Bezig…" : "Run RLS self-test"}
            </Button>
            {mutation.isError && (
              <p className="text-sm text-destructive">
                Fout: {(mutation.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>

        {report && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>Resultaat</span>
                <Badge variant={allGreen ? "default" : "destructive"}>
                  {report.passed} / {report.total} geslaagd
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Uitgevoerd op {new Date(report.run_at).toLocaleString("nl-NL")}
              </p>
              <ul className="space-y-2">
                {report.results.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm"
                  >
                    {r.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{r.name}</div>
                      {r.detail && (
                        <div className="mt-1 text-xs text-muted-foreground">{r.detail}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
