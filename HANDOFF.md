# Handoff

Kurzer Zustandsbericht des Projekts. Wer hier einsteigt, liest zuerst dieses Dokument, dann `SPEC.md`.

**Stand:** 12. September 2026 · Konfiguration `0.9-entwurf` · Node 22, keine Abhängigkeiten · **38 Tests grün**

---

## 1. Worum es geht

Eine wöchentliche Bitcoin-Zyklus-Ampel auf GitHub Pages. Ziel ist minimales Handeln: rund 6 bis 8 Transaktionen in vier Jahren, gekauft nahe am Zyklustief, verkauft nahe am Zyklushoch. Die Seite meldet sich nur, wenn etwas zu tun ist.

Zwei Grundentscheidungen prägen alles:

- **Zwei getrennte Motoren.** Tiefs erkennt man an der Bewertung, Hochs eher an Zeit und Trendbruch, weil die Bewertungsspitzen von Zyklus zu Zyklus sinken. Ein gemeinsamer Score würde beides verwässern.
- **Phasen laufen nur vorwärts** (④ Abwärtstrend → ① Akkumulation → ② Aufwärtstrend → ③ Verteilung → ④). Kein Rückweg, jeder Wechsel braucht zwei Wochenschlüsse in Folge. Das verhindert Flackern.

Keine Anlageberatung. Das Modell beruht auf vier Zyklen und kann falsch liegen.

---

## 2. Was fertig ist

| Meilenstein | Inhalt | Status |
|---|---|---|
| M0 | Quellen-Check aus dem GitHub-Runner | ✅ gelaufen, `reports/sources-check.md` |
| M1 | Datenpipeline: Abruf, Wochenreihe, 16 Indikatorwerte | ✅ läuft im Runner |
| M2 | Normierung, zwei Motoren, Gates, Phasenmaschine, Backtest | ✅ Code fertig, erster Backtest gelaufen, **Kalibrierung offen** (siehe 6.1) |
| M3 | Oberfläche: Ampel, Phasenleiste, Motoren, Checkliste, Kacheln | ⬜ nächster Schritt |
| M4 | Position und Journal im Browser (`localStorage`) | ⬜ |
| M5 | Benachrichtigungen (GitHub Issues, optional ntfy) | ⬜ |
| M6 | Verlauf und Zyklus-Uhr als Grafik | ⬜ |
| M7 | Härtung, Barrierefreiheit | ⬜ |

**38 Tests, alle grün** (`node --test "test/**/*.test.mjs"`).

---

## 3. Aufbau

```
scripts/fetch.mjs        Quellen  → data/raw/          (Netzwerk, fehlertolerant)
scripts/build.mjs        data/raw → data/*.json        (Wochenauswertung + Replay)
scripts/backtest.mjs     weekly   → reports/backtest.md
scripts/check-sources.mjs Quellen-Check (M0)
engine/                  reine Logik, kein Netzwerk, deterministisch
  dates.mjs      Datumshelfer, Wochendefinition
  series.mjs     SMA, EMA, Standardabweichung, Perzentil
  indicators.mjs Tages- und Wochenwerte aller Indikatoren
  normalize.mjs  Ankerpunkte, Perzentile, Hybrid → 0–100
  engines.mjs    Indikator-Scores, Familien, Abdeckung, Konvergenz, Gates
  phases.mjs     Zustandsmaschine, Tranchen, Events
  rows.mjs       weekly.json → Objekte, abgeleitete Felder
config/engine.json       alle Schwellen und Gewichte, versioniert
data/                    Ausgaben (siehe unten)
```

**Wichtigstes Prinzip: die Wiedergabe ist die Wahrheit.** `build.mjs` spielt bei jedem Lauf die gesamte Wochenhistorie neu ab und leitet daraus Phase, Tranchen und Events her. `state.json` und `events.json` sind Ausgaben, keine Eingaben. Dadurch kann der Zustand nicht auseinanderlaufen, und jeder Lauf ist reproduzierbar. Einzige Ausnahme: das Feld `notified_at` in `events.json` bleibt über Läufe erhalten, damit nichts doppelt gemeldet wird.

### Dateien in `data/`

| Datei | Inhalt | Wer schreibt |
|---|---|---|
| `raw/*.json` | Rohdaten je Quelle, Tagesreihen | `fetch.mjs` |
| `raw/_status.json` | Erfolg oder Fehler je Quelle | `fetch.mjs` |
| `manual.json` | STH-Realized-Price von Hand | **du** |
| `weekly.json` | eine Zeile pro Sonntag seit 2010, kompakt | `build.mjs` |
| `latest.json` | aktueller Wochenstand, alles was die Seite braucht | `build.mjs` |
| `phases.json` | Phase und beide Scores je Woche (für den Verlauf) | `build.mjs` |
| `events.json` | alle Signale mit `notified_at` | `build.mjs` |
| `state.json` | Zustand der Phasenmaschine (Transparenz) | `build.mjs` |

### Workflows

| Workflow | Zeitplan (UTC) | Aufgabe |
|---|---|---|
| Wochenlauf | Mo 03:10 | Tests, Daten, Auswertung, Backtest, Commit |
| Tageslauf | täglich 06:15 | Tageswerte, löst nie Signale aus |
| Backtest | manuell + bei Änderung in `config/` oder `engine/` | Report neu rechnen |
| Quellen-Check | manuell | prüft alle Quellen aus dem Runner |

---

## 4. Datenlage

**Verfügbar (16 Indikatoren):** MVRV-Z-Score, Realized Price, Abstand zum 200-Wochen-Schnitt, Mayer Multiple, Puell, Hash Ribbons, Drawdown, Monate seit Hoch, Zyklus-Uhr, Überdehnung über dem Trendband, Pi Cycle, Wochen extremer Angst, Gier-Niveau, Funding, Wikipedia-Aufmerksamkeit.

**Quellen:** Bitstamp (Preis seit 2011), Coin Metrics Community (On-Chain seit 2010, CC BY-NC), alternative.me, Wikimedia, Deribit, mempool.space. Kein Binance: GitHub-Runner stehen in den USA und bekommen HTTP 451.

Der Realized Price wird aus `PriceUSD ÷ CapMVRVCur` abgeleitet, weil Coin Metrics die Realized Cap nicht mehr gratis liefert. Gegenprobe im September 2026: 76'676 ÷ 1,44 = 53'247, veröffentlicht waren rund 53'500. Passt.

**Fehlend (fünf Kennzahlen, nur bei BGeometrics):** STH-Realized-Price, Angebot im Verlust, Reserve Risk, RHODL-Ratio, LTH-Abgabe.

Die Gratis-Stufe von BGeometrics verbietet genau unseren Aufbau: Abrufe von fremden Systemen (GitHub-Runner) und die Anzeige auf einer öffentlichen Seite gelten als kommerzielle Weiterverbreitung. **Eine Anfrage per E-Mail an info@bgeometrics.com läuft.** Der Token liegt bereits als Secret `BGEOMETRICS_TOKEN` bereit und wird nicht benutzt.

**Folgen, solange die Antwort aussteht:**

- Die Familie „Halter & Stimmung" im Kauf-Motor fällt aus (nur 1 von 3 Mitgliedern). Abdeckung 80 %.
- Die Familie „Halterverhalten" im Verkaufs-Motor fällt aus. Abdeckung 80 %.
- Der STH-Realized-Price kommt aus `data/manual.json`. Ohne Eintrag arbeitet der Trendfilter nur mit dem Bull Market Support Band, und die Nachkauf-Chance in Phase ② ist abgeschaltet.
- Gate B stützt sich statt auf das Angebot im Verlust allein auf das MVRV-Perzentil.

---

## 5. Abweichungen von SPEC.md

Beim Bauen zeigten sich vier Stellen, an denen die Spezifikation nachgezogen wurde. Alle sind dort schon eingearbeitet, hier die Begründung:

| Thema | Alt | Neu | Warum |
|---|---|---|---|
| On-Chain-Rückgriff | 3 Tage, danach „fehlt"; Höchstalter 10 Tage | Rückgriff 10 Tage, „alt" ab 4 Tagen | Die beiden Regeln widersprachen sich. Coin Metrics hinkt regelmässig 1 bis 2 Tage nach. |
| Zyklus-Uhr ohne relevantes Halving | fehlender Wert | Score 0 | Als „fehlt" wäre die Familie „Zeit & Trend" (Innengewicht 25 von 40) unter die 50-Prozent-Regel gefallen und der ganze Verkaufs-Motor auf 40 % Abdeckung gesunken, also dauerhafte Datenlücke in den Phasen ② und ③. |
| Konvergenz | fest 3 Familien | `min(3, verfügbare Familien)`, mindestens 2 | Da eine Kauf-Familie dauerhaft fehlt, blieben nur drei. Ein Signal darf nicht daran scheitern, dass eine Quelle nicht lizenziert ist. Das Feld `reduced` in `latest.json` zeigt an, wenn die Anforderung gesenkt wurde. |
| Trendbruch-Meldung | nur bei offenen Tranchen | immer beim Übergang ③ → ④ | Der Trendbruch ist auch dann eine wichtige Information, wenn nichts mehr zu verkaufen ist. |

---

## 6. Was als Nächstes dran ist

### 6.1 Kalibrierung (blockiert M3 nicht, aber v1.0)

**Erster Backtest mit echten Daten, Lauf 1 (Konfiguration 0.9, Abdeckungsschwelle noch 70 %):**

| Strategie | BTC am Ende | Wert | Transaktionen |
|---|---|---|---|
| Halten | 1,0000 | 80'339 | 0 |
| Ampel | 2,6800 | 215'309 | 12 |
| Sparplan | 52,61 | 4'226'337 | 153 |
| Sparplan mit Faktor | 58,15 | 4'671'917 | 153 |

Die Kaufseite arbeitet gut. Die Phaseneintritte lagen bei den Tiefs 2015 (0 Wochen Abstand), 2018 (−2 Wochen) und 2022 (−21 Wochen). Durchschnittliche Kaufpreise: 1,36 × und 1,43 × des Tiefs, beide unter dem Ziel von 1,6 ×. Für 2015 gab es keinen Kauf, weil die Simulation mit 1 BTC und ohne Cash startet.

Die Verkaufsseite traf 2021 (0,73 × des Hochs, Ziel 0,6 ×), verpasste aber 2017 und 2025.

**Ursache für 2017 gefunden und behoben.** Der Verkaufs-Motor war strukturell blind: Fear & Greed beginnt erst im Februar 2018, Funding 2019, und die Familie „Halterverhalten" fehlt wegen BGeometrics. Damit blieben nur „Zeit & Trend" (40) und „Relative Bewertung" (25), zusammen 65 % Abdeckung, also unter der damaligen Mindestschwelle von 70 %. Jede Woche galt als Datenlücke, die Zähler standen still. Die Maschine lief durch das Hoch von Dezember 2017 hindurch und wachte erst im März 2018 auf, nach dem Absturz. Verkauft wurde dann beim Trendbruch zu 8'188, also 0,41 × des Hochs.

Behebung: `zone_min_coverage` von 0,70 auf 0,60. Die beiden tragenden Verkaufs-Familien ergeben 65 % und tragen die Logik von E1 und E2 allein. Ein Test sichert das ab.

**Ursache für 2025 noch offen.** Phase 2 lief von Januar 2023 bis heute durch, ohne je in die Verteilung zu wechseln. Die Abdeckung war hier vollständig, es liegt also nicht an fehlenden Daten. Vermutlich blieb der Verkauf-Score knapp unter der Schwelle von 40 für Weg E2. Denkbare Gründe: geringe Überdehnung über dem Trendband (2025 lief der Kurs kaum davon), ein Pi-Cycle-Verhältnis weit unter 1 und niedrige Retail-Aufmerksamkeit.

Dafür schreibt der Backtest jetzt einen **Diagnose-Abschnitt**: für jedes bekannte Extrem die nächstgelegene und die stärkste Woche im Fenster von ±26 Wochen, mit Score, Abdeckung, Gates und allen Familienwerten. Damit lässt sich der Hebel gezielt bestimmen, statt zu raten.

**Vorgehen für Lauf 2:** `node scripts/backtest.mjs --sensitivity`, dann den Diagnose-Abschnitt für „Hoch 2025-10-06" lesen. Erst danach Parameter ändern, und nur solche, die in allen Zyklen helfen. Am Ende `config/engine.json` auf `version: "1.0"` setzen.

**Offene Nebenfrage:** ob das Juni-Tief 2026 bei rund 60'000 über Gate B ausgelöst hätte. Der Phasen-Abschnitt zeigt bisher durchgehend Phase 2 seit Januar 2023, also nein. Auch das klärt die Diagnose.

### 6.2 M3, die Oberfläche

`latest.json` enthält bereits alles Nötige: `phase`, `lamp`, `action`, `engines` (Scores, Familien, Konvergenz, Gates), `next_transition` mit der Checkliste, `flags`, `tranches`, `scores` je Indikator, `indicators` mit Rohwerten und Alter, `filters`, `cycle_clock`.

Zu bauen ist eine einzelne `index.html` in der Gestaltung des Cockpits, mit einer senkrechten Ampel als einzigem lautem Element. Einzelheiten in SPEC 8. Aus dem Cockpit direkt übernehmbar: CSS-Variablen, Karten- und Bottom-Sheet-Stile, der `store`-Helfer, Export und Import, das Zahlenformat.

Für die Entwicklung soll `index.html?fixture=2022-06-19` eine Datei aus `data/fixtures/` laden statt `latest.json`, damit sich jeder Zustand prüfen lässt, ohne auf den Markt zu warten.

---

## 7. Fallstricke

| Thema | Merksatz |
|---|---|
| Zeitzone | Alles UTC. Die Woche endet Sonntag 24:00 UTC, ein Wochenschluss ist erst ab Montag 00:00 UTC gültig. |
| Binance | In der Pipeline nicht verwendbar (HTTP 451 aus US-Rechenzentren). Im Cockpit funktioniert es, weil dein Browser abruft. |
| Kein Blick in die Zukunft | Perzentile und Standardabweichungen dürfen nur Vergangenheit sehen. Dafür gibt es je einen Test in `engine.test.mjs` und `engines.test.mjs`. Bei Änderungen an `series.mjs` oder `engines.mjs` nicht entfernen. |
| Öffentliches Repo | Bestände, Kaufpreise und Beträge gehören nie ins Repo. Die Pipeline erzeugt nur allgemeine Signale, die Position lebt im Browser. |
| GitHub-Inaktivität | Nach 60 Tagen ohne Aktivität deaktiviert GitHub geplante Workflows. Die wöchentlichen Commits sollten das verhindern. |
| Überanpassung | Vier Zyklen sind wenig. Schwellen vorab festlegen, nicht nachträglich suchen. |
| Abdeckung vor 2018 | Ohne Fear & Greed (ab Feb. 2018) und Funding (ab 2019) erreicht der Verkaufs-Motor nur 65 %. Die Schwelle von 60 % ist deshalb bewusst gewählt und darf nicht ohne Not angehoben werden. |
| Startkapital im Backtest | 1 BTC, kein Cash. Käufe vor dem ersten Verkauf sind nicht finanzierbar. Für Tiefs zählt daher der Zeitpunkt des Phaseneintritts, nicht der Kaufpreis. |

---

## 8. Offene Entscheidungen

1. **BGeometrics:** Antwort abwarten. Bei Zusage kommen die fünf Kennzahlen über einen Schalter dazu, die Familien werden wieder vollständig, und die Konvergenzanforderung steigt automatisch zurück auf drei Familien.
2. **Kalibrierung:** siehe 6.1. Erst danach `version: "1.0"`.
3. **Benachrichtigungen (M5):** GitHub Issues genügen zunächst. Ob zusätzlich ntfy, entscheidet sich beim Bauen.
