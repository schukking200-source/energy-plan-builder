# ISO27001 / BIO2 — Migratiedocument

Dit document beschrijft wat er moet gebeuren om de Isolatieplan-tool van het
Lovable-ontwikkelplatform te verhuizen naar een ISO27001/BIO2-compliant
productieomgeving (Azure NL-region). Het is de **bovenliggende context** bij
roadmap-modules **9a t/m 9d**.

---

## 1. Scope & doel

**In scope ISMS:**
- Alle productiedata van bewoners (adresgegevens, woninggegevens, scans, rapporten)
- Authenticatie en autorisatie
- Logging, backup, sleutelbeheer
- Hosting van database, storage en server-functies

**Buiten scope:**
- Ontwikkelomgeving (Lovable preview) — mag bestaan zolang er geen
  productie-persoonsgegevens in staan
- Lokale ontwikkelmachines (vallen onder generiek beleid)
- iPad-app als artefact — broncode blijft in Git, distributie via TestFlight/MDM

---

## 2. Wat blijft in Lovable (broncode, geen certificering nodig)

| Onderdeel | Locatie |
|---|---|
| React/TanStack frontend | `src/routes/`, `src/components/` |
| Server-functies (logica) | `src/lib/*.functions.ts` |
| iOS RoomPlan-plugin | `ios-plugin/`, `capacitor.config.ts` |
| SQL-migraties (definities) | `supabase/migrations/` |
| RLS-policies, businesslogica | in migraties |
| Roadmap, planning, docs | `.lovable/`, `IPAD_SETUP.md` |

Bij oplevering: hele Git-repo overdragen aan enterprise-partij. Zij deployen
identieke code tegen Azure-stack.

---

## 3. Wat verhuist naar Azure

| Onderdeel | Nu (Lovable Cloud) | Target (Azure NL) | ISO/BIO2-control |
|---|---|---|---|
| **Database** | Supabase Postgres (gedeelde infra) | Azure Database for PostgreSQL Flexible Server, CMK, private endpoint, geo-redundant backup | A.8.24, A.8.13 |
| **Auth** | Supabase Auth | Entra External ID (B2C) tenant, MFA verplicht, Conditional Access | A.5.17, A.8.5 |
| **File storage** | Supabase Storage bucket `lidar-scans` | Azure Blob Storage, CMK, immutability policy, private endpoint | A.5.33, A.8.24 |
| **Secrets** | Supabase platform secrets | Azure Key Vault + Managed Identities | A.8.24 |
| **Server-functies** | TanStack runtime op Lovable edge | Azure Container Apps in eigen tenant | A.8.25, A.8.31 |
| **Logs / audit** | `aud_events` tabel + Supabase logs | Azure Monitor + Log Analytics, retentie 12 mnd, immutable | A.8.15, A.5.28 |
| **Backups** | Supabase managed | Geo-redundant binnen EU, restore-test 2×/jaar | A.8.13 |
| **Email (auth + transactioneel)** | Supabase SMTP | Eigen domein + SMTP-relay, DKIM/DMARC/SPF | A.5.14 |
| **DNS / TLS** | Lovable subdomein | Eigen domein, certificate via Key Vault | A.8.24 |

---

## 4. Datamapping per tabel

| Tabel | Classificatie | Inhoud | Retentie | Target |
|---|---|---|---|---|
| `id_profiles` | Persoonsgegeven (laag) | Display name, email-link | Levensduur account + 90d | Azure Postgres |
| `in_measurement` | **Persoonsgegeven (hoog)** — adres, woningdata | Opname-payload, snapshot-hash, status | 7 jaar (subsidieretentie) | Azure Postgres + Blob (USDZ) |
| `aud_events` | Audit | Append-only hash-chain | 7 jaar, immutable | Azure Postgres (read-only) + Log Analytics mirror |
| `user_roles` | Autorisatie | role-toekenningen | Levensduur account | Azure Postgres |
| `roadmap_task` | Intern | Project-planning | Geen | Mag in Lovable blijven (geen klantdata) |
| Storage `lidar-scans` | Persoonsgegeven (hoog) | USDZ + JSON-scans van woningen | 7 jaar | Azure Blob met CMK + immutability |

---

## 5. ISMS-deliverables (door enterprise-partij of jij te leveren)

- [ ] **Scope-document & SoA** (Statement of Applicability)
- [ ] **Risicoanalyse + behandelplan** per assettype
- [ ] **Beleidsdocumenten**: toegangsbeleid, cryptografie, incidenten, leveranciers, BCM
- [ ] **DPIA** (AVG art. 35) — verplicht door categorie woninggegevens + locatie
- [ ] **Verwerkersovereenkomsten** met Microsoft Azure, Lovable, AI-gateway-provider
- [ ] **Pentest-rapport** (extern, vóór go-live; jaarlijks)
- [ ] **Vulnerability scan** + remediation-procedure (continu)
- [ ] **Incident response plan** + AP-meldroute (72u)
- [ ] **Toegangsmatrix** — koppelen aan bestaande rollen (admin, kwaliteitscommissie, steekproef, adviseur, bewoner)
- [ ] **Leveranciersbeoordeling** (Azure, Lovable, OpenAI, etc.)
- [ ] **Change-management procedure** — Git PR + 4-ogen + audit-trail
- [ ] **BCP/DRP** — restore-test bewijs

---

## 6. Cutover-draaiboek (samenvatting)

```text
T-30d  Azure landingszone klaar (9a)
T-21d  Entra B2C tenant + MFA-policy (9b)
T-14d  Pentest + remediation (9c)
T-7d   Dry-run migratie naar Azure staging
T-3d   Communicatie naar gebruikers (downtime-window)
T-1d   Final pg_dump op Lovable, freeze schrijfacties
T-0    DNS-switch, Azure live
T+1u   Smoke-tests (LiDAR end-to-end)
T+24u  Go/no-go beslissing — rollback mogelijk
T+7d   Lovable Cloud data archiveren + verwijderen
```

**Rollback-criterium**: kritieke flow (scan → upload → rapport) werkt niet
binnen 1u → DNS terug naar Lovable, dataverlies = 0 (Lovable Cloud staat nog).

---

## 7. Verantwoordelijkheden

| Onderdeel | Wie |
|---|---|
| Code, features, bugfixes | Lovable (jij + AI) |
| Azure-infrastructuur | Enterprise-partij |
| ISMS-documentatie | Enterprise-partij + jij (process-owner) |
| Pentest | Externe partij |
| DPIA | Jij (verwerkingsverantwoordelijke) |
| Cutover-uitvoering | Enterprise-partij |
| Lopende operatie post-go-live | Enterprise-partij (SLA) |

---

## 8. Verwijzing naar roadmap

De concrete taken staan in `roadmap_task` onder:

- **Module 9a** — Infrastructuur (Azure)
- **Module 9b** — Identiteit (Entra)
- **Module 9c** — Compliance & ISMS
- **Module 9d** — Cutover

Te zien op `/roadmap` zodra je ingelogd bent.

---

*Laatst bijgewerkt: 2026-06-11. Wijzigingen via PR; dit document is onderdeel
van het ISMS en moet jaarlijks gereviewd worden (control A.5.1).*
