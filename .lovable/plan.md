# Plan: RoomPlan LiDAR-scan op de iPad

Apple RoomPlan gebruikt de LiDAR-sensor van je iPad Pro om automatisch een 3D-plattegrond te maken (muren, ramen, deuren, plafondhoogte) met afmetingen. Het werkt alleen native — niet in de browser/preview.

## Wat de gebruiker straks ziet

In het opname-scherm van een woning komt een nieuwe knop **"Ruimte scannen (LiDAR)"**. Tik → fullscreen camera-overlay van Apple → langzaam door de kamer lopen → "Done" → de app krijgt:

- USDZ-bestand (3D-model, om later te bekijken)
- JSON met alle muren, ramen, deuren + afmetingen in meters
- Automatisch geüpload naar de bestaande `lidar-scans` bucket
- Gekoppeld aan de opname (`in_measurement`)

## Technische opzet

### 1. Custom Capacitor-plugin `RoomPlanScanner` (native Swift)
Locatie: `ios/App/App/Plugins/RoomPlanScanner/`
- ~150 regels Swift die `RoomCaptureView` (iOS 16+) presenteren
- Bij "Done" exporteert het USDZ + JSON naar de app-sandbox en geeft de bestandspaden terug aan JS
- Plugin geregistreerd in `Package.swift` zodat `cap sync` hem meeneemt

### 2. TypeScript-wrapper
`src/integrations/roomplan/index.ts` — typesafe `scanRoom()` functie, checkt of we native draaien (anders nette foutmelding).

### 3. UI-component `<LidarScanButton>`
- Toont alleen op iOS-native (verborgen in browser-preview)
- Start scan → toont voortgang → leest bestanden → upload naar Storage → koppelt aan `in_measurement.id`
- Gebruikt in het opname-formulier (`src/routes/intake.new.tsx` of `_id.tsx`)

### 4. Database
Nieuwe tabel `in_lidar_scan` (append-only, gekoppeld aan opname):
- `measurement_id`, `storage_path_usdz`, `storage_path_json`, `room_summary` (jsonb: aantal muren, totaal m², plafondhoogte), `captured_by`
- RLS: adviseur ziet eigen scans; reviewers (kwaliteitscommissie/steekproef/admin) zien alles
- Storage policies op `lidar-scans` bucket: alleen eigen captured_by mag uploaden; reviewers mogen lezen

### 5. Info.plist permissies
- `NSCameraUsageDescription` — "Gebruikt voor LiDAR-scan van de ruimte"
- iOS 16+ deployment target controleren

### 6. Build-flow
Na de plugin-toevoeging één keer `npm run ios:setup` opnieuw zodat Xcode de Swift-plugin oppikt; daarna gewoon `npm run ios:run`.

## Vereisten / beperkingen

- **Werkt alleen op iPad Pro met LiDAR + iOS 16+** (jouw iPad voldoet — iOS 26.5 in screenshot).
- **Werkt NIET in browser-preview / Lovable preview** — alleen na `npm run ios:run` op de echte iPad. In de browser tonen we daarom een uitgegrijsde knop met uitleg.
- Eerste keer vraagt de iPad om camera-toestemming.

## Wat ik NIET in dit plan stop (vraag indien gewenst apart)

- 3D-viewer in de webapp om de USDZ te bekijken (kan later).
- Automatisch isolatieoppervlak per muur berekenen vanuit de JSON (eerst ruwe data, daarna pas regels).
- Editor om muren/ramen handmatig bij te werken na scan.

## Wat ik van jou nodig heb voor ik begin

Eén bevestiging — verder kan ik door:

1. Akkoord met de tabel `in_lidar_scan` zoals hierboven?
2. De scan-knop in **het opname-detailscherm** (`/intake/:id`) plaatsen, of liever al in de nieuwe-opname-wizard (`/intake/new`)?
