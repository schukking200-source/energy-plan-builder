
## 1. Roadmap-tabel uitbreiden (data-migratie, geen schemawijziging)

Bestaande `roadmap_task`-rijen met `module = 'go_live'` worden opgesplitst in vier nieuwe modules. Schema verandert niet — alleen `module`, `module_label`, `module_order`, `is_golive_blocker`, `is_project_blocker` van bestaande/nieuwe rijen.

Nieuwe modules (module_order 90–93, blijven onderaan):

| key | label | doel |
|---|---|---|
| `golive_infra` | 9a Infrastructuur (Azure) | Landingszone, Postgres, Key Vault, Blob, Monitor, migratiescript |
| `golive_identity` | 9b Identiteit (Entra B2C) | Tenant, MFA, rolmapping, cutover auth |
| `golive_compliance` | 9c Compliance & ISMS | ISMS-docs, DPIA, VWO's, pentest, logging/retentie |
| `golive_cutover` | 9d Cutover | DNS, downtime-window, rollback, dataoverdracht |

Per module ~4–6 taken (`type='enterprise'`, `is_golive_blocker=true`). Bestaande Azure/BIO2-taken uit `go_live` worden gemapt naar de juiste sub-module; geen taken verloren. Eén SQL-migratie via supabase--migration met `UPDATE` + `INSERT` statements.

## 2. Document `.lovable/ISO27001_MIGRATIE.md`

Nieuw bestand, ~250 regels, secties:

1. **Scope & doel** — wat valt onder ISMS, wat niet
2. **Wat blijft in Lovable** — broncode, migraties, plugin (zoals eerder beschreven)
3. **Wat verhuist naar Azure** — tabel per onderdeel (DB, Auth, Storage, Secrets, Functies, Logging, Backups, Email) met:
   - huidige locatie in Lovable Cloud
   - target Azure-service (concreet: Azure Database for PostgreSQL Flexible Server, Entra External ID, Blob Storage met CMK, Key Vault, Container Apps, Log Analytics)
   - waarom (ISO/BIO2-control referentie: A.8.24, A.5.17, A.8.15, etc.)
4. **Datamapping** — per tabel (`id_profiles`, `in_measurement`, `aud_events`, `user_roles`, `roadmap_task`) classificatie + retentie + bewaarplaats
5. **ISMS-deliverables** — checklist: SoA, risicoanalyse, DPIA, VWO's, pentest, incident response, toegangsmatrix, leveranciersbeoordeling
6. **Cutover-draaiboek** — pg_dump → Azure restore, storage sync, DNS-switch, rollback
7. **Verantwoordelijkheden** — jij vs. enterprise-partij vs. Lovable
8. **Verwijzing naar roadmap** — link naar modules 9a–9d

## 3. Volgorde van uitvoering

1. `supabase--migration` — data-update voor modules 9a–9d (geen schemawijziging)
2. Bestand `.lovable/ISO27001_MIGRATIE.md` schrijven
3. Korte verwijzing toevoegen aan `.lovable/plan.md` (1 regel onder bestaande sectie)

## Wat NIET in deze stap

- Geen UI-wijziging aan `/roadmap` — de bestaande module-rendering pakt de nieuwe modules automatisch op (groepering is dynamisch op `module_order`).
- Geen schemawijziging aan `roadmap_task`.
- Geen Azure-resources aanmaken; alleen documentatie en taken.
- Geen verandering aan bestaande taken in modules 0–8.

## Technische details

- Migratie gebruikt `UPDATE roadmap_task SET module=..., module_label=..., module_order=... WHERE module='go_live' AND title ILIKE '%...%'` per categorie, plus `INSERT` voor nieuwe taken die nog niet bestaan.
- `is_golive_blocker=true` blijft; `is_project_blocker=false` (alleen Module 0/LiDAR is project-blocker).
- Module_order: 90 (infra), 91 (identity), 92 (compliance), 93 (cutover) — zit ná module 8 (audit, order 80) en houdt de visuele volgorde.

---

## Vervolg: ISO27001-migratie

Module 9 (`go_live`) is gesplitst in **9a Infrastructuur**, **9b Identiteit**, **9c Compliance & ISMS** en **9d Cutover**. Volledige toelichting (datamapping, verantwoordelijkheden, cutover-draaiboek) staat in [`.lovable/ISO27001_MIGRATIE.md`](./ISO27001_MIGRATIE.md).
