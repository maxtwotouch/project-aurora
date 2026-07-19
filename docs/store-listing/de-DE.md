# App Store listing — de-DE (Deutsch)

> **Draft translation notice:** this locale's copy was drafted by an AI agent using the app's own `src/i18n/locales/de.json` catalog for terminology, not by a professional translator. Per `docs/roadmap-2026-27.md` Phase 1 ("Native-speaker review of consent copy + store copy (de/fr/es/zh) — legal and quality gate before paid traffic"), **do not submit this locale to App Store Connect without a native-speaker review first.**

## App name
**Aurora Tromsø**

Character count: 13 / 30.

Localized form of the proposed en-US name "Aurora Tromsø" (see that file's app-name note for the branding-mismatch open item, which applies identically here).

## Subtitle
**28 Orte, live vorhergesagt**

Character count: 26 / 30.

## Promotional text
Live-Aurora-Score, das beste Zeitfenster für heute Nacht und 28 benannte Orte rund um Tromsø mit Anfahrtsdetails. Fünf Sprachen. Kein Konto, kein Tracking.

Character count: 155 / 170. (Promotional text can be updated any time without a new binary submission — App Store Connect > App Store tab > this field is not versioned with the build.)

## Keywords
`nordlicht,polarlicht,norwegen,arktis,kp index,polarnacht,livekamera,aussichtspunkte,heute nacht`

Character count: 95 / 100. Comma-separated, no spaces after commas (spaces cost characters and Apple's keyword matching does not need them).

**Reasoning per term** (why each word/phrase is here, and why words already in the app name/subtitle are deliberately *not* repeated — Apple indexes name + subtitle + keywords together for search, so duplicating a word already present elsewhere wastes budget that could cover new ground):

- Name/Untertitel decken bereits "aurora", "tromsø", "orte" und "live" ab — hier bewusst nicht wiederholt.
- "nordlicht" und "polarlicht" — beide gängigen deutschen Suchbegriffe für das Thema (regionale Präferenz variiert, beide werden abgedeckt statt nur einer).
- "norwegen", "arktis" — geografische Suchbegriffe für Nutzer, die noch keine konkrete Stadt kennen.
- "kp index" — im deutschsprachigen Raum ebenfalls als Fachbegriff gesucht (auch von Astro-/Weather-Enthusiasten); real genutztes Feature (`tonight.band.kpNow`).
- "polarnacht" — ehrlich zur Saisonalität der App (Polartag/-nacht-Logik) und ein reales Reiseplanungs-Suchwort.
- "livekamera" — reales Feature (Live-Himmelskameras), eigenes Suchinteresse getrennt von "Vorhersage".
- "aussichtspunkte" — Kernbegriff für die Ortsvergleichsfunktion, ergänzt statt dupliziert "Orte" aus dem Untertitel.
- "heute nacht" — deckt die zeitlich eingegrenzte Suche ("nordlicht heute nacht tromsø") ab, passend zur App-eigenen Formulierung ("Heute Nacht" in `common.tonightEyebrow`).

## Description
Character count: 3204 (~2500 targeted per the task brief; Apple's actual field limit is ~4000, so this has headroom). Benefit-led, no superlatives ("best", "amazing", etc. deliberately avoided per Apple's Guideline 2.3.1 and this app's own factual/warm tone — see `src/i18n/locales/de.json` for the in-app voice this matches).

```
Tromsø liegt mitten im Polarlicht-Oval — einer der zuverlässigeren Orte der Welt, um zwischen etwa September und April das Nordlicht zu sehen. Aurora Tromsø hilft Ihnen zu entscheiden, wo und wann Sie heute Nacht losfahren sollten, mit aktuellen Wetter- und geomagnetischen Daten statt Rätselraten.

DER HEUTIGE AUSBLICK AUF EINEN BLICK
Öffnen Sie die App und sehen Sie einen Aurora-Wert von 0 bis 100 für heute Nacht, berechnet aus Bewölkung, Dunkelheit und dem planetaren KP-Index (geomagnetische Aktivität). Die App zeigt das beste Drei-Stunden-Zeitfenster und aktualisiert sich im Laufe des Abends automatisch.

28 BENANNTE AUSSICHTSPUNKTE RUND UM TROMSØ
Vergleichen Sie 28 feste Orte — Fjorde, Seen und dunkle Aussichtspunkte außerhalb der Lichtverschmutzung der Stadt — jeweils mit eigenem Live-Wert, Entfernung vom Stadtzentrum und kurzer Beschreibung. Viele Orte enthalten praktische Angaben zur Anfahrt wie die nächste Bushaltestelle und einen Parkplatz; wo als „verifiziert" markiert, wurden diese Angaben mit Informationen der Tromsø kommune abgeglichen. Sortieren Sie nach stärkster Vorhersage oder kürzester Fahrt und öffnen Sie die Navigation mit einem Fingertipp.

KARTE, LIVE-HIMMELSKAMERAS UND AURORA-BILDER
Sehen Sie alle Orte auf einer Karte in Fahrtreihenfolge, prüfen Sie vor der Abfahrt ein Raster von Live-Himmelskameras und werfen Sie einen Blick auf aktuelle Aurora-Bilder eines Universitäts-Feeds (UiT / NO-SPACE), um sich selbst ein Bild von der Lage zu machen.

EHRLICH BEI TAGESLICHT
Tromsø liegt nördlich des Polarkreises: Von etwa Mitte Mai bis Ende Juli hält die Mitternachtssonne den Himmel die ganze Nacht hell — unabhängig vom KP-Index gibt es dann keine realistische Chance auf Polarlicht. Statt in dieser Zeit einen irreführenden Wert anzuzeigen, sagt Ihnen die App klar, dass die Saison derzeit geschlossen ist, und nennt das ungefähre Datum der Wiedereröffnung.

FÜNF SPRACHEN
Die App ist vollständig auf Englisch, Deutsch, Französisch, Spanisch und Chinesisch (vereinfacht) verfügbar, jederzeit umschaltbar in den Einstellungen — praktisch auf Reisen oder wenn Sie das Telefon einer Freundin oder einem Freund reichen.

DATENSCHUTZ VON HAUS AUS
Die App funktioniert vollständig ohne Konto, Login oder Einrichtung und fragt nie nach Ihrem GPS-Standort — jede angezeigte „Entfernung" wird aus den festen Koordinaten eines Ortes berechnet, nicht aus Ihrer Verfolgung. Wenn Sie möchten, können Sie freiwillig anonyme, aggregierte Zählungen teilen (welche Orte angesehen oder navigiert werden, nach Stunde gebündelt), damit wir und die Tromsø kommune sehen, welche Orte tatsächlich genutzt werden. Eine Ablehnung ändert nichts an der Funktion der App, und Sie können das Teilen jederzeit in den Einstellungen ein- oder ausschalten. Diese App enthält keine Tracker oder Werbe-SDKs von Drittanbietern.

DATENQUELLEN
Wetterdaten von MET Norway (dem norwegischen Wetterdienst) und geomagnetische Daten vom Space Weather Prediction Center der NOAA, regelmäßig über die Nacht aktualisiert.

Aurora Tromsø hat einen einzigen Ort und einen einzigen Zweck: eine ehrliche, nüchterne Antwort auf die Frage „Lohnt es sich, heute Nacht rauszufahren?" — nicht mehr und nicht weniger.
```

## What's New template
Use for every release's App Store Connect "What's New in This Version" field. Fill in the
bracketed part per release; keep the rest as a stable, low-effort template so release notes
don't become a chore that gets skipped.

```
Dieses Update aktualisiert die heutige Vorhersage und die Ortsangaben. Datenquellen: Einstellungen > Über die App. Fragen oder Korrekturen zu Orten: über den Support-Link auf dieser Seite.
```
