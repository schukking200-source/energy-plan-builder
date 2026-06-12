# iPad debug logging — stap-voor-stap

Twee niveaus van logging zijn nu actief:

## 1. JS-overlay op het scherm (geen Xcode nodig)

Automatisch zichtbaar in de native iPad-app (én in de browser met `?debug=1`).
Onderaan het scherm verschijnt een zwart paneel met groene tekst dat toont:

- alle `console.log` / `warn` / `error` calls
- JS-exceptions (`window.onerror`, `unhandledrejection`)
- mislukte `fetch`-calls met URL + status
- elke SPA-navigatie (pushState / replaceState) met de nieuwe URL

Tap op de header om in te klappen. "Copy" kopieert alle logs naar het klembord
zodat je ze in een mail/chat kunt plakken.

→ **Doe dit eerst:** open de app op de iPad en lees wat er op het scherm staat.
Dat verklaart meestal direct waarom het scherm wit blijft.

## 2. Xcode-console logging (volledige stacktraces)

Voor diepe debug zie je álle WebView-events ook in Xcode:

### Eenmalig instellen (in Xcode)

1. Kopieer eerst het bestand op je Mac:
   ```bash
   cp ios-plugin/WebViewLogger.swift ios/App/App/WebViewLogger.swift
   ```
2. Open `ios/App/App.xcworkspace` handmatig in Finder/Xcode; gebruik hiervoor niet `npx cap open ios`.
3. Sleep `WebViewLogger.swift` (uit `ios/App/App/`) in de Project Navigator
   onder de groep **App** → vink **"Add to target: App"** aan.
4. Open `ios/App/App/AppDelegate.swift` en voeg helemaal onderaan in de
   functie `application(_:didFinishLaunchingWithOptions:)`, **vóór de
   `return true`**, één regel toe:

   ```swift
   WebViewLogger.install()
   ```

5. Niet via Chrome/Safari testen; start daarna weer met `npm run ios:run`.

### Logs lezen

In Xcode: **View → Debug Area → Activate Console** (`⌘ + Shift + Y`).
Typ in het filterveld rechtsonder `WV:` — je ziet dan o.a.:

```
WV: ✅ WKWebView gevonden, logger actief
WV: ➡️ navigate → capacitor://localhost/
WV: ⏳ start loading capacitor://localhost/
WV: [INFO] 🟢 WebView logger geïnstalleerd — UA: Mozilla/5.0 …
WV: [ERROR] window.onerror: Cannot read properties of undefined …
WV: ✅ finished loading capacitor://localhost/
```

Bij een wit scherm zie je in de log direct wélke JS-fout op wélke URL gebeurt.
Stuur die regels door en ik kan exact zien wat er stuk is.
