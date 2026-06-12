# iOS LiDAR-app — stabiel runpad

Doel: één commando dat de web-build maakt, de iOS-map schoon genereert/synchroniseert, Apple Team ID detecteert, bouwt met Xcode en de native RoomPlan-app direct op een iPhone Pro of iPad Pro start.

## Vereisten

- Mac met **Xcode 15+**
- Apple Developer-account, ingelogd in Xcode
- **iPhone Pro of iPad Pro met LiDAR** en **iOS/iPadOS 16+**
- USB-C/Lightning kabel; iPhone/iPad vertrouwt de Mac
- Developer Mode aan op de iPhone/iPad

## Normale run

```bash
npm install
npm run ios:run
```

Het script doet zelf:

1. `room-plan-scanner` lokale Capacitor-plugin controleren
2. web-build naar `dist/client` maken
3. Capacitor `ios/App` genereren of synchroniseren
4. `NSCameraUsageDescription` zetten
5. iOS deployment target naar `16.0` zetten
6. Apple Team ID ophalen uit env, Xcode-project, Xcode build settings, `.ios-dev-team`, Keychain of provisioning profiles
7. fysieke iPhone/iPad kiezen
8. bouwen met `xcodebuild`
9. installeren en starten met `devicectl`

## Als het eerder is vastgelopen: schoon opnieuw

Gebruik dit in plaats van blijven sleutelen:

```bash
npm run ios:clean
```

Dit verwijdert de gegenereerde `ios/`-map en bouwt hem opnieuw op vanuit Capacitor + de lokale `room-plan-scanner` plugin.

## Team ID forceren

Als Xcode/Keychain het Team ID niet automatisch leveren:

```bash
IOS_DEVELOPMENT_TEAM=ABCDE12345 npm run ios:run
```

Het script cachet dit lokaal in `.ios-dev-team` voor volgende runs.

## Belangrijk: niet meer handmatig Swift-bestanden toevoegen

De oude `ios-plugin/RoomPlanPlugin.swift` route is verwijderd. De juiste route is nu uitsluitend:

- `local-plugins/room-plan-scanner`
- pluginnaam in JavaScript: `RoomPlanScanner`
- native pluginklasse: `RoomPlanScannerPlugin`

Dus: **niet** handmatig bestanden naar Xcode slepen en **niet** `npx cap run ios` gebruiken.

## Stap 7 — Testen

1. Login in de app (dev auto-login knop werkt).
2. Ga naar **Opnames → Nieuwe opname**.
3. Scroll naar **LiDAR / 3D-scan** → knop **"Start RoomPlan-scan"** is nu actief (blauw).
4. Tik → Apple's RoomPlan-scanner opent fullscreen.
5. Loop door de kamer, scan muren/deuren/ramen → tik **Gereed**.
6. Resultaat verschijnt terug in formulier (oppervlak, aantal ruimtes, ramen).
7. Klik **Indienen** → USDZ + JSON worden geüpload naar onze backend.

---

## Distributie naar adviseurs (TestFlight)

Zodra het werkt op jouw iPhone/iPad:

1. In Xcode: **Product → Archive** (10 min build-tijd).
2. Window → Organizer → **Distribute App → TestFlight & App Store**.
3. Upload (15 min). Wacht op email van Apple ("Processing complete").
4. Op https://appstoreconnect.apple.com → **TestFlight → Internal Testing** → voeg testers toe via email.
5. Testers krijgen mail + downloaden gratis **TestFlight**-app uit App Store → installeren jouw app.

Geen App Store-review nodig voor interne testers (max 100). Externe testers (tot 10.000) wel eenmalig 24-48u review.

---

## Wat je NIET hoeft te doen

- ❌ Geen ander hosting opzetten — de iOS-app bundelt de web-build lokaal.
- ❌ Geen preview-URL nodig in de iOS-app; die kan in WKWebView wit blijven door remote JavaScript-errors.
- ❌ Bij frontend-wijzigingen: geen Xcode Run nodig; draai opnieuw `npm run ios:run`.

## Bekende valkuilen

| Probleem                                | Oplossing                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "Untrusted Developer" op iPhone/iPad    | Settings → VPN & Device Management → Trust                                                                                                      |
| Scan-knop blijft "Alleen in iOS-app"    | Start met `npm run ios:run`, niet via Safari/Chrome/preview                                                                                     |
| Witte pagina in app                     | Controleer dat `capacitor.config.ts` `webDir: "dist/client"` heeft, draai `npm run ios:run` opnieuw en lees de debug-overlay / Xcode `WV:` logs |
| Build-error "RoomPlan module not found" | Draai `npm run ios:clean`; het script zet iOS target en Podfile opnieuw op 16.0                                                                 |
| Signing blijft fout                     | Draai `IOS_DEVELOPMENT_TEAM=ABCDE12345 npm run ios:clean`                                                                                       |

---

## Voortgang aan mij doorgeven

Laat me weten bij welke stap je vastloopt — meestal is het Xcode-signing of de bundle-id. Dan los ik het in één bericht op.
