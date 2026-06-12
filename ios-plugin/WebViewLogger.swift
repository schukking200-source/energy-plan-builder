// WebViewLogger.swift
// Drop dit bestand in ios/App/App/ (naast AppDelegate.swift) en voeg het toe aan
// het Xcode-project (sleep het in de App-group → "Add to target: App").
//
// Het hookt op de Capacitor WKWebView en logt:
//   • elke JS console.log / warn / error met bestand+regel
//   • elke navigatie (URL-change, redirects, loaderrors)
//   • het laden van de hoofdpagina (succes / fail met reden)
//
// Open daarna in Xcode het Debug-paneel (⌘+Shift+Y) en filter op "WV:" om alleen
// WebView-logs te zien.

import Foundation
import UIKit
import WebKit
import Capacitor

@objc public class WebViewLogger: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    public static let shared = WebViewLogger()
    private weak var originalNavDelegate: WKNavigationDelegate?

    @objc public static func install() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            shared.attach()
        }
    }

    private func attach() {
        guard let webView = findWebView() else {
            NSLog("WV: ❌ Geen WKWebView gevonden — opnieuw proberen…")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.attach() }
            return
        }
        NSLog("WV: ✅ WKWebView gevonden, logger actief")

        // 1) JS console capture
        let js = """
        (function(){
          if (window.__wvLoggerInstalled) return; window.__wvLoggerInstalled = true;
          function send(level, args){
            try {
              var msg = Array.prototype.map.call(args, function(a){
                if (a instanceof Error) return a.name+': '+a.message+'\\n'+(a.stack||'');
                if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e){ return String(a); } }
                return String(a);
              }).join(' ');
              window.webkit.messageHandlers.wvlogger.postMessage({level: level, msg: msg, url: location.href});
            } catch(e){}
          }
          ['log','info','warn','error','debug'].forEach(function(m){
            var orig = console[m].bind(console);
            console[m] = function(){ send(m, arguments); orig.apply(console, arguments); };
          });
          window.addEventListener('error', function(e){
            send('error', ['window.onerror:', e.message, 'at', (e.filename||'?')+':'+e.lineno+':'+e.colno, e.error && e.error.stack]);
          });
          window.addEventListener('unhandledrejection', function(e){
            send('error', ['unhandledrejection:', (e.reason && (e.reason.stack || e.reason.message)) || String(e.reason)]);
          });
          send('info', ['🟢 WebView logger geïnstalleerd — UA:', navigator.userAgent]);
        })();
        """
        let userScript = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(userScript)
        webView.configuration.userContentController.add(self, name: "wvlogger")

        // 2) Navigation logging — wrap bestaande delegate
        originalNavDelegate = webView.navigationDelegate
        webView.navigationDelegate = self

        // 3) Reload zodat het user-script gegarandeerd in de huidige pagina draait
        webView.reload()
    }

    private func findWebView(in view: UIView? = nil) -> WKWebView? {
        let root = view ?? UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController?.view
        guard let root = root else { return nil }
        if let wv = root as? WKWebView { return wv }
        for sub in root.subviews { if let wv = findWebView(in: sub) { return wv } }
        return nil
    }

    // MARK: WKScriptMessageHandler
    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        let level = (body["level"] as? String ?? "log").uppercased()
        let msg = body["msg"] as? String ?? ""
        let url = body["url"] as? String ?? "?"
        NSLog("WV: [%@] %@  (%@)", level, msg, url)
    }

    // MARK: WKNavigationDelegate (logging + forward)
    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        NSLog("WV: ➡️ navigate → %@", navigationAction.request.url?.absoluteString ?? "?")
        if let d = originalNavDelegate, d.responds(to: #selector(WKNavigationDelegate.webView(_:decidePolicyFor:decisionHandler:) as (WKNavigationDelegate) -> (WKWebView, WKNavigationAction, @escaping (WKNavigationActionPolicy) -> Void) -> Void)) {
            d.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        NSLog("WV: ⏳ start loading %@", webView.url?.absoluteString ?? "?")
        originalNavDelegate?.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSLog("WV: ✅ finished loading %@", webView.url?.absoluteString ?? "?")
        originalNavDelegate?.webView?(webView, didFinish: navigation)
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("WV: ❌ didFail: %@", error.localizedDescription)
        originalNavDelegate?.webView?(webView, didFail: navigation, withError: error)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("WV: ❌ didFailProvisional: %@", error.localizedDescription)
        originalNavDelegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }
}
