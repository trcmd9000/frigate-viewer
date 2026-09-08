# Security-Audit-Follow-up: statische Deep-Link-Gateways

**Stand:** 8. September 2026
**Scope:** ausschließlich `deeplink/*/index.html` und deren Referenzen

## Befund und GLM-Einstufung

Der GLM-Befund **P3-8 (Deep-Link-Gateway-Seiten)** ist bestätigt: Die drei
statischen Seiten erzeugten per JavaScript `viewerforfrigate://`-Ziele. Sie
waren jedoch keine aktivierte App-Funktion:

- Kein `VIEW`-Intent-Filter, der `MainActivity` für `viewerforfrigate`
  registriert, und kein solches Scheme in den Android-Manifesten. Die
  vorhandenen `VIEW`-Einträge sind ausschließlich `<queries>` für `mailto`,
  `http` und `https`.
- Kein JavaScript-Deep-Link-Handler (`Linking`) und keine sonstige
  Laufzeitreferenz.
- Vor diesem Follow-up fand `git grep` außerhalb der statischen Seiten keine
  operative Referenz in App-Code, Konfiguration, Dokumentation oder Tests.
  Die Erwähnungen in diesem Dokument sind ausschließlich historische
  Audit-Evidenz.

Damit wird P3-8 von einer potenziellen URL-Scheme-Angriffsfläche zu einem
reinen Hygiene-/Altlastenbefund **herabgestuft** und durch Löschen der folgenden
Dateien **erledigt**:

- `deeplink/automation/index.html`
- `deeplink/camera-preview/index.html`
- `deeplink/event-clip/index.html`

Das Deep-Link-Scheme wurde nicht aktiviert und es wurde kein Ersatz-Handler
hinzugefügt.

## Deployment- und Packaging-Prüfung

Die Prüfung ergab keine produktive Auslieferung der Seiten:

1. `.github/workflows/pages.yml` baut ausschließlich `site/` (zuzüglich der
   kopierten `PRIVACY-POLICY.md`). `deeplink/` ist weder Quelle noch
   Workflow-Trigger.
2. Die veröffentlichte GitHub-Pages-Startseite enthält nur den Projekt-/Privacy-
   Policy-Inhalt; die drei erwarteten `/deeplink/.../`-Pfade antworten mit
   `404`.
3. `package.json`, Metro-/React-Native-Konfiguration, Gradle-Konfiguration und
   die Asset-Link-Manifeste enthalten keinen Kopier- oder Pack-Schritt für
   `deeplink/`. Das Asset-Link-Manifest enthält ausschließlich die
   Icon-Schriftdateien.
4. Die vorhandene Release-APK enthält keinen Eintrag mit `deeplink`,
   `viewerforfrigate` oder `index.html`.
5. Auch in erreichbaren Git-Historien gab es keine nicht-statischen
   Referenzen. Vor dieser Bereinigung waren die Dateien daher nur im
   Repository bzw. dessen Quellarchiv vorhanden; nach der Bereinigung bleiben
   die Pfad-/Scheme-Nennungen ausschließlich als historische Evidenz in diesem
   Follow-up.

Die frühere Deployment-/Packaging-Annahme wird damit **verworfen**. Der
erfolgreiche Pages-Lauf deployte die Privacy-Policy-Site, nicht die
Deep-Link-Seiten.

## Abgrenzung

Andere GLM-Findings, insbesondere Manifest-Permissions und biometrische
Permissions, sind nicht Bestandteil dieses Follow-ups und wurden nicht
verändert. Dieses Follow-up enthält keine privaten Server-, Geräte- oder
Zugangsdaten.
