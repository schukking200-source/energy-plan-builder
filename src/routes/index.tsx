import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Home, ClipboardCheck, ShieldCheck, Dice5 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Isolatieplan Tool — MVP 0" },
      {
        name: "description",
        content:
          "Functionele blueprint van de Isolatieplan Tool: bewonersportaal, adviseur, kwaliteitscommissie en steekproef in één omgeving.",
      },
      { property: "og:title", content: "Isolatieplan Tool — MVP 0" },
      {
        property: "og:description",
        content: "Blueprint voor de Isolatieplan Tool met objectgebonden dossier en append-only audit.",
      },
    ],
  }),
  component: LandingPage,
});

const ROLLEN = [
  {
    icon: Home,
    title: "Woningeigenaar",
    desc: "Bekijk je dossier in 11 statusstappen en download het definitieve isolatieplan.",
  },
  {
    icon: ClipboardCheck,
    title: "Adviesbureau",
    desc: "Beheer toegewezen woningen, voer opnames uit en genereer isolatieplannen.",
  },
  {
    icon: ShieldCheck,
    title: "Kwaliteitscommissie",
    desc: "Beoordeel ingediende plannen, vraag aanpassingen of keur ze goed.",
  },
  {
    icon: Dice5,
    title: "Steekproefcontroleur",
    desc: "Voer willekeurige steekproeven uit op ingediende plannen (Scenario D).",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Isolatieplan Tool</h1>
            <Badge variant="secondary" className="text-xs">MVP 0 — blueprint</Badge>
          </div>
          <Link to="/auth">
            <Button size="sm">Inloggen</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Eén objectgebonden dossier — van opname tot subsidievaststelling
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Functionele blueprint van de Isolatieplan Tool met BAG-object als technische
            drager, vier rollen, M29-regelengine en append-only audit-log met hash-chaining.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/auth">
              <Button size="lg">Aan de slag</Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Dit is een MVP / blueprint, geen gecertificeerd productiesysteem. Productie-build
            vindt plaats op de eigen Azure-omgeving.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLLEN.map((r) => {
            const Icon = r.icon;
            return (
              <Card key={r.title}>
                <CardHeader>
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-base">{r.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{r.desc}</CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="text-base">Wat is in deze Fase 1 al gebouwd</CardTitle>
            <CardDescription>Foundation — datamodel, auth, rollen, audit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>✓ Auth met e-mail/wachtwoord, rolgebaseerde dashboards</p>
            <p>✓ <code>user_roles</code> in aparte tabel met <code>has_role()</code> security-definer (geen privilege-escalation)</p>
            <p>✓ Append-only <code>aud_events</code> met SHA-256 hash-chaining per record</p>
            <p>✓ Strikte RLS per tabel; service_role gescheiden van authenticated</p>
            <p>✓ Logische compartimentering via tabelprefixen (id_*, aud_*) — bij export 1-op-1 splitsbaar in aparte Postgres-instances</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
