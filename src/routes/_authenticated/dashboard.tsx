import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Mijn dossier — Isolatieplan Tool" }],
  }),
  component: BewonerDashboard,
});

const STAPPEN = [
  "Account aangemaakt",
  "Woning gekoppeld (BAG)",
  "Opname ingepland",
  "Opname uitgevoerd",
  "Berekening huidige situatie (A)",
  "Maatregeladvies opgesteld",
  "Berekening voorstel (B)",
  "Concept-rapport gereed",
  "Definitief rapport beschikbaar",
  "Uitvoering gestart",
  "Subsidievaststelling",
];

function BewonerDashboard() {
  const huidigeStap = 1; // demo: account aangemaakt
  const pct = ((huidigeStap + 1) / STAPPEN.length) * 100;

  return (
    <AppShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Welkom in jouw isolatieplan-dossier</CardTitle>
            <CardDescription>
              Hier zie je de voortgang van jouw aanvraag in 11 stappen. Zodra je woning is
              gekoppeld aan een BAG-object kun je een opname inplannen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Voortgang</span>
                <span className="text-muted-foreground">Stap {huidigeStap + 1} van {STAPPEN.length}</span>
              </div>
              <Progress value={pct} />
            </div>
            <ol className="space-y-2">
              {STAPPEN.map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <Badge variant={i <= huidigeStap ? "default" : "outline"} className="w-8 justify-center">
                    {i + 1}
                  </Badge>
                  <span className={i <= huidigeStap ? "" : "text-muted-foreground"}>{s}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wat komt in volgende fases</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Fase 2 — BAG-objectkoppeling en eigendomsrelatie · Fase 3 — opnameformulier ·
            Fase 4 — rekenscenario's A/B/C/D + M29 · Fase 5 — rapport + wijzigingsverzoeken.
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
