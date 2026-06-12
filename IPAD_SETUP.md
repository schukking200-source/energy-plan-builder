# iPad LiDAR-app — Stap-voor-stap live krijgen

Doel: één-tap RoomPlan-scan vanuit deze app op je iPad Pro.

## Wat je nodig hebt (eenmalig)

- ✅ Mac met **Xcode 15 of nieuwer** (App Store, gratis)
- ✅ **Apple Developer Account** (€99/jaar — https://developer.apple.com)
- ✅ **iPad Pro met LiDAR** (2020 of nieuwer) — iPadOS 17+
- ✅ USB-C → USB-C kabel (iPad ↔ Mac) voor eerste install
- ✅ Deze Lovable-repo lokaal via GitHub Sync (knop rechtsboven in Lovable)

---

## Stap 1 — Repo lokaal trekken (5 min)

1. In Lovable rechtsboven: **GitHub → Connect to GitHub** → repo aanmaken.
2. Op je Mac in Terminal:
   ```bash
   git clone <jouw-github-url> isolatieplan-tool
   cd isolatieplan-tool
   bun install        # of: npm install
   ```

## Stap 2 — Web-build maken (2 min)

```bash
bun run build
```
Dit vult de `dist/` map die Capacitor nodig heeft.

## Stap 3 — iOS-project genereren (3 min)

```bash
bunx cap add ios
bunx cap sync ios
```
Resultaat: nieuwe map `ios/App/` met een Xcode-project.

## Stap 4 — RoomPlan Swift-plugin toevoegen (5 min)

De Swift- en Objective-C bestanden staan al in `ios-plugin/` in de repo.

1. Open Xcode-project: `bunx cap open ios`
2. In Xcode-zijbalk: **App → App** (geel mapje) → rechtsklik → **Add Files to "App"…**
3. Selecteer beide bestanden uit `ios-plugin/`:
   - `RoomPlanPlugin.swift`
   - `RoomPlanPlugin.m`
4. **Belangrijk**: vink "Copy items if needed" aan en "Target: App" aan.
5. Xcode vraagt: "Create Bridging Header?" → **Yes**.

## Stap 5 — Camera-permissie + capabilities (3 min)

In Xcode, klik op **App** (blauw icoon bovenaan zijbalk) → tab **Info**:

1. Klik `+` onder **Custom iOS Target Properties** → voeg toe:
   - Key: `Privacy - Camera Usage Description`
   - Value: `Camera-toegang is nodig voor LiDAR-scanning van de woning.`

Tab **Signing & Capabilities**:
2. **Team**: kies jouw Apple Developer Team (login eerst via Xcode → Settings → Accounts).
3. **Bundle Identifier**: laat staan (`app.lovable.7ac6a83168e3442aabfbb208b55a243d`) of maak iets eigens zoals `nl.isolatieplan.tool`.

## Stap 6 — iPad aansluiten + installeren (5 min)

Gebruik voortaan dit commando. Dit bouwt lokaal, synchroniseert Capacitor en
start de **native iPad-app** direct op de aangesloten iPad — geen Chrome,
Safari of Lovable preview-URL.

```bash
npm run ios:run
```

Als je nog geen lokale setup hebt gedaan, gebruik eerst:

```bash
bash scripts/setup-ios.sh
```

Voorwaarden:

1. Sluit iPad aan met kabel. Op iPad: **Trust This Computer**.
2. Op iPad: **Instellingen → Privacy & Security → Developer Mode → AAN** (iPad herstart).
3. Eerste keer: op iPad → **Instellingen → Algemeen → VPN & Apparaatbeheer → Jouw Apple ID → Vertrouwen**.

Als de iPad niet gevonden wordt of signing nog niet klopt, stopt het script met
een foutmelding. Het opent bewust geen Xcode, Chrome, Safari of preview-URL.

App opent automatisch op iPad en laadt de lokale build uit `dist/`.

## Stap 7 — Testen

1. Login in de app (dev auto-login knop werkt).
2. Ga naar **Opnames → Nieuwe opname**.
3. Scroll naar **LiDAR / 3D-scan** → knop **"Start RoomPlan-scan"** is nu actief (blauw).
4. Tik → Apple's RoomPlan-scanner opent fullscreen.
5. Loop door de kamer, scan muren/deuren/ramen → tik **Done**.
6. Resultaat verschijnt terug in formulier (oppervlak, aantal ruimtes, ramen).
7. Klik **Indienen** → USDZ + JSON worden geüpload naar onze backend.

---

## Distributie naar adviseurs (TestFlight)

Zodra het werkt op jouw iPad:

1. In Xcode: **Product → Archive** (10 min build-tijd).
2. Window → Organizer → **Distribute App → TestFlight & App Store**.
3. Upload (15 min). Wacht op email van Apple ("Processing complete").
4. Op https://appstoreconnect.apple.com → **TestFlight → Internal Testing** → voeg testers toe via email.
5. Testers krijgen mail + downloaden gratis **TestFlight**-app uit App Store → installeren jouw app.

Geen App Store-review nodig voor interne testers (max 100). Externe testers (tot 10.000) wel eenmalig 24-48u review.

---

## Wat je NIET hoeft te doen

- ❌ Geen ander hosting opzetten — de iPad-app bundelt de web-build lokaal.
- ❌ Geen preview-URL nodig in de iPad-app; die kan in WKWebView wit blijven door remote JavaScript-errors.
- ❌ Bij frontend-wijzigingen: wél opnieuw `bun run build` + `bunx cap sync ios` + Xcode Run doen.

## Bekende valkuilen

| Probleem | Oplossing |
|---|---|
| "Untrusted Developer" op iPad | Settings → VPN & Device Management → Trust |
| Scan-knop blijft "Alleen in iPad-app" | Start met `npm run ios:run`, niet via Safari/Chrome |
| Witte pagina in app | Sluit Safari/Chrome af, start opnieuw met `npm run ios:run` en lees de debug-overlay / Xcode `WV:` logs |
| Build-error "RoomPlan module not found" | Deployment target onder iOS 16 — zet op **iOS 16.0** in target settings |

---

## Voortgang aan mij doorgeven

Laat me weten bij welke stap je vastloopt — meestal is het Xcode-signing of de bundle-id. Dan los ik het in één bericht op.
