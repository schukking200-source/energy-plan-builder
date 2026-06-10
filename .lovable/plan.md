# Isolatieplan Tool — Lovable MVP 0 als blueprint voor aanbesteding

## Positionering

Dit plan beschrijft wat Lovable bouwt als **"MVP 0" / functionele blueprint**, parallel aan de aanbesteding van de definitieve enterprise-build. Opbrengst: werkend datamodel, alle portalen, regelengine-skelet, en API-contracten die de winnende ontwikkelpartij 1-op-1 kan overnemen op Azure.

**Niet:** productiesysteem onder BIO2/ISO27001, geen LiDAR-app, geen gecertificeerde NTA 8800-engine, geen iDIN/eHerkenning, geen 9 fysieke DB's.

---

## Globale scope-matrix

| Onderdeel uit FO/TO | In Lovable MVP 0 | In aanbesteding (Azure-build) |
|---|---|---|
| Datamodel BAG-object + relaties + scenario's A–D | ✅ Volledig | Overname schema + migratie naar 9 DB's |
| Bewonersportaal | ✅ Volledig functioneel | Hergebruik UI, koppelen aan iDIN |
| Adviesbureau-webportaal | ✅ Volledig | Hergebruik UI |
| Kwaliteitscommissie review-UI | ✅ Volledig | Hergebruik UI |
| Steekproefcontrole-UI | ✅ Volledig | Hergebruik UI |
| M29-regelengine | ✅ Als pure functie + testcases | Productie-versie met versiebeheer |
| NTA 8800 rekenkern | ⚠️ Stub met identieke I/O-shape | Licentie Uniec3/Vabi inpluggen |
| Rapport-generatie (concept → definitief + hash) | ✅ Volledig | Hergebruik logica |
| Append-only audit-log met hash-chaining | ✅ In Postgres | Migratie naar WORM + SIEM |
| 9 fysieke DB-compartimenten + CMK per DB | ❌ → logische scheiding via 9 schema's + RLS | ✅ Fysieke splitsing op Azure |
| iPad-app met LiDAR / RoomPlan | ❌ Niet mogelijk | Native Swift-team, apart traject |
| Offline-sync ACK 1–5 | ❌ → web upload-flow zonder offline | Native CRDT/queue-implementatie |
| iDIN / eHerkenning | ❌ → Supabase Auth + MFA als placeholder | Entra ID B2C + broker (Signicat) |
| Azure hosting + BIO2/ISO27001-audit | ❌ → Lovable Cloud (Cloudflare) | ✅ Azure West-Europa |
| SIEM, break-glass, Key Vault per compartiment | ❌ → app-logging | ✅ Azure-native |

---

## Fasering

### Fase 1 — Foundation (datamodel + auth + rollen)

**Deliverables**
- 9 Postgres-schema's binnen één Supabase: `identity`, `objects`, `intake`, `calc`, `rules`, `report`, `quote_exec`, `finance`, `audit`
- Strikte RLS per schema, aparte DB-rollen (service-role-scheiding als gateway-equivalent)
- `user_roles`-tabel + `has_role()` security-definer (least-privilege, geen role-escalation)
- Append-only `audit.events` (INSERT-only grants, hash-chained per record)
- Auth: Supabase Auth + email/password + Google + **MFA verplicht** voor medewerkers
- 4 lege rol-dashboards (bewoner / adviseur / kwaliteitscommissie / steekproef) als routing-shell

**Buiten scope deze fase:** iDIN/eHerkenning, CMK per schema, SIEM.

---

### Fase 2 — Object & relaties (DB3 + objectrelatie-model)

**Deliverables**
- BAG-object entiteit (`bag_id`, adres, bouwjaar, gebruiksdoel) — handmatige invoer + CSV-import (geen live BAG-API)
- `object_relation` met `valid_from`, `valid_until`, `relation_type` (eigenaar, adviseur-toewijzing, uitvoerder)
- Object access policy: middleware die elke read/write valideert tegen actieve relatie
- Maskering bij eigendomswissel (oude eigenaar verliest toegang tot technische data, behoudt eigen correspondentie)
- Audit-events op elke objecttoegang

**Buiten scope:** live BAG-koppeling (placeholder voor productie).

---

### Fase 3 — Opname-flow (web, geen iPad)

**Deliverables**
- Opnameformulier in web-PWA (tablet-vriendelijk responsive)
- Gestructureerde velden volgens ISSO-opnameprotocol: bouwdelen, openingen, ventilatie, risico's
- Verplichte velden + foto-upload (Supabase Storage, versleuteld)
- **Bronstatus + bewijskracht** per ingevulde waarde (manual / measured / inferred / lidar-derived)
- Versie + hash per opname-snapshot

**Expliciet buiten scope:**
- LiDAR / RoomPlan capture (vereist native iOS)
- Offline-first werking met ACK 1–5 sync
- Device binding + lokale sleutel-vernietiging

→ De web-flow gebruikt dezelfde tabelstructuur als de uiteindelijke iPad-app, zodat sync-laag later kan worden toegevoegd zonder schema-migratie.

---

### Fase 4 — Rekenkern stub + M29-regelengine

**Deliverables**
- `calculation_engine` als pluggable interface (`runScenario(input) → result`)
- **Stub-implementatie** met dezelfde I/O-shape als NTA 8800 (deterministisch, traceerbaar, maar **niet gecertificeerd**)
- 4 scenario's A/B/C/D met `input_snapshot`, `engine_version`, `result_json`, `input_hash`, `output_hash`
- M29-regelengine als pure functie: `evalRule(rule_code, rule_version, input) → {result, explanation, blocking}`
- Rule-catalogus tabel met versies
- `m29_rule_check` records per scenario

**Belangrijk:** stub is duidelijk gemarkeerd als niet-productie. Productie-engine (Uniec3/Vabi) wordt door enterprise-partij ingeplugd via dezelfde interface.

---

### Fase 5 — Rapportage & wijzigingsverzoeken

**Deliverables**
- Concept-rapport-generatie (PDF, Lovable-side, server-rendered)
- `report_version`, `document_hash`, hash-verificatie bij download
- Wijzigingsverzoeken-flow (adviseur → kwaliteitscommissie → goedkeuren/afkeuren/aanpassen)
- Definitief rapport = bevroren PDF + hash-chain in audit
- Bewonersportaal: 11-staps statusweergave + download definitief rapport

---

### Fase 6 — Kwaliteitscommissie + steekproef

**Deliverables**
- Kwaliteitscommissie-queue: openstaande plannen, M29-rule-check overzicht per plan, beslismoment
- Steekproefmodule: willekeurige selectie (configureerbaar percentage), controleformulier scenario D
- Verschilanalyse D vs C, herstelpunten-registratie
- Alle beslissingen in append-only audit

---

### Fase 7 — Uitvoering & subsidiebewijs (light)

**Deliverables**
- Quotation-validatie: offerte vs maatregelencatalogus + m² uit rapport
- Uitvoeringsbewijs: factuur-upload, foto's, certificaten
- Scenario C (uitgevoerd) berekening + definitieve M29-status
- Subsidie-indicatie (geen echte uitbetaling, geen koppeling provinciale financiën)

**Buiten scope:** echte betalingsstromen, koppeling provincie-grootboek, DB4/DB5 financieel-detail.

---

### Fase 8 — Audit-export & overdracht

**Deliverables**
- Audit-replay export per objectdossier (JSON + PDF)
- API-contract-documentatie (OpenAPI) van alle endpoints
- Datamodel-export (ERD + schema.sql) gereed voor migratie naar 9 Azure-instances
- Overdrachtdocument voor enterprise-partij: wat is gebouwd, welke interfaces zijn waar, welke stubs vervangen moeten worden

---

## Wat de winnende ontwikkelpartij hierna doet

1. Code-export via GitHub naar eigen Azure-tenant
2. Postgres-schema's splitsen in 9 Azure Database for PostgreSQL-instances achter Azure API Management
3. Supabase Auth → Entra ID B2C met iDIN/eHerkenning broker
4. NTA 8800 stub vervangen door gecertificeerde engine (Uniec3/Vabi)
5. Native iOS-app bouwen met LiDAR/RoomPlan + ACK 1–5 sync tegen bestaande API
6. SIEM, Key Vault CMK per DB, WORM-storage voor audit
7. BIO2/ISO27001-certificeringstraject

---

## Aandachtspunten

- **Stub-rekenkern mag nooit als productie worden ingezet** — duidelijk in UI markeren ("indicatieve berekening, niet NTA 8800-gecertificeerd")
- **Geen echte persoonsgegevens van bewoners** in MVP 0 — alleen testdata of pseudonimisering
- **DPIA + verwerkersovereenkomst** met Lovable/Supabase nodig zodra echte persoonsgegevens worden gebruikt (ook in pilot)
- **Fase-volgorde is hard:** Fase 1–2 zijn fundament, alles erna bouwt erop. Niet parallelliseren over fases 1–2.

---

Akkoord om met **Fase 1 (Foundation)** te beginnen, of wil je eerst nog scope-aanpassingen doorvoeren?
