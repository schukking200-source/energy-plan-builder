
# Roadmap herstructureren per module — LiDAR eerst

## Waarom

Huidige roadmap is per **fase** (1–9, lineair). Jij wil per **module/blok** kunnen sturen en opleveren, met **LiDAR als harde voorwaarde**: lukt LiDAR op iPad niet → hele project stopt. Dat moet visueel bovenaan staan, niet verstopt in fase 3.

## Wat ik bouw

### 1. Nieuwe groepering: "module" naast "phase"

Tabel `roadmap_task` krijgt één extra kolom:
- `module` (text) — bv. `"lidar"`, `"foundation"`, `"object"`, `"opname"`, `"rekenkern"`, `"rapportage"`, `"kwaliteit"`, `"uitvoering"`, `"audit"`, `"go_live"`
- `module_label` (text) — leesbaar label
- `module_order` (smallint) — volgorde modules
- `is_project_blocker` (bool) — strenger dan `is_golive_blocker`: zonder dit stopt het hele project (nu: alleen LiDAR-module)

Bestaande `phase`-data blijft staan (voor history), maar UI groepeert voortaan op module.

### 2. Module 0 — LiDAR / iPad (NIEUW, bovenaan)

Wordt als allereerste blok toegevoegd met `is_project_blocker=true`. Taken:

```text
[ ] Apple Developer-account actief (€99/jr)
[ ] Xcode 26.2 + iOS 26.5 device support gedownload
[ ] iPad Developer Mode aan + getrust
[ ] cap add ios + cap sync ios uitgevoerd
[ ] RoomPlanPlugin.swift + .m toegevoegd aan Xcode-target
[ ] Bridging header aangemaakt
[ ] Camera-permissie in Info.plist
[ ] Signing team + bundle-id ingesteld
[ ] App installeert op fysieke iPad via kabel
[ ] RoomPlan-scan opent + voltooit
[ ] USDZ + JSON upload naar Supabase Storage werkt
[ ] Eerste end-to-end test: scan → opname → ingediend
[ ] TestFlight-build live voor 1 externe tester
```

Status van deze module bepaalt of de andere modules überhaupt zin hebben — duidelijk in UI markeren met rode banner: *"Zonder werkende LiDAR-pipeline stopt het project. Eerst Module 0 afronden."*

### 3. Module-mapping bestaande taken

| Bestaande fase           | Nieuwe module       |
|--------------------------|---------------------|
| 1 Foundation             | `foundation`        |
| 2 Object & relaties      | `object`            |
| 3 Opname-flow (web)      | `opname` (web-fallback, LiDAR-stukken splitsen naar `lidar`) |
| 4 Rekenkern + M29        | `rekenkern`         |
| 5 Rapportage             | `rapportage`        |
| 6 Kwaliteit + steekproef | `kwaliteit`         |
| 7 Uitvoering & subsidie  | `uitvoering`        |
| 8 Audit-export           | `audit`             |
| 9 Go-live blockers Azure | `go_live`           |

### 4. UI-aanpassing `/_authenticated/roadmap`

- Groepering op `module_order`, niet meer op `phase`.
- Bovenaan: prominente **"Project-blockers"** kaart die `is_project_blocker` items toont (LiDAR-module). Rood/dik, niet te missen.
- Per module: voortgangsbalk + status-pill (`niet gestart` / `bezig` / `klaar` / `geblokkeerd`).
- Optioneel filter: "Toon alleen open taken" / "Toon alleen MVP 0".
- Modulekop klikbaar = inklapbaar, zodat één module tegelijk in focus kan.

### 5. Volgorde-advies in UI

Banner bovenaan: *"Aanbevolen levering: Module 0 (LiDAR) → Module Foundation → Object → Opname → …"*. Modules onder Module 0 blijven zichtbaar maar krijgen subtiel "wacht op Module 0"-label tot LiDAR groen is.

## Technische uitvoering

1. **Migratie**: `ALTER TABLE roadmap_task ADD COLUMN module text, module_label text, module_order smallint, is_project_blocker bool default false;`
2. **Data-migratie**: bestaande rijen mappen naar module (zie tabel hierboven). LiDAR-gerelateerde taken uit fase 3 verhuizen naar module `lidar` met `is_project_blocker=true`.
3. **Seed Module 0**: 13 taken bovenstaand, allen `is_project_blocker=true`, `type='mvp0'`.
4. **UI**: `src/routes/_authenticated/roadmap.tsx` herschrijven — groep op module, project-blocker banner, inklapbare secties.
5. **`.lovable/plan.md`** bijwerken: module-indeling als nieuwe canonical structuur.

## Wat NIET in deze stap

- Geen wijziging in andere modules' inhoudelijke taken (alleen hergroepering).
- Geen verandering aan datamodel van opnames/rapporten.
- Geen TestFlight-automatisering — blijft handmatig.

---

Akkoord om dit zo uit te voeren? Of wil je eerst andere modules toevoegen/splitsen voordat ik de migratie schrijf?
