# Handoff

Zustandsbericht des Projekts. Wer hier einsteigt, liest zuerst dieses Dokument, dann `SPEC.md`.

**Stand:** 13. September 2026 · Konfiguration `1.0` (eingefroren) · Node 22, keine Abhängigkeiten · 53 Tests grün
**Status:** betriebsbereit. M0 bis M6 abgeschlossen, nur M7 (Härtung) offen.
**Seite:** https://panta-rey.github.io/Panta-Rey-BTC-Ampel/ · **Repo:** https://github.com/Panta-rey/Panta-Rey-BTC-Ampel

---

## 1. Worum es geht

Eine wöchentliche Bitcoin-Zyklus-Ampel auf GitHub Pages. Ziel ist minimales Handeln: rund 6 bis 8 Transaktionen in vier Jahren, gekauft nahe am Zyklustief, verkauft nahe am Zyklushoch. Die Seite meldet sich nur, wenn etwas zu tun ist.

Drei Entscheidungen prägen alles:

- **Zwei getrennte Motoren.** Tiefs erkennt man an der Bewertung, Hochs eher an Zeit und Trendbruch, weil die Bewertungsspitzen von Zyklus zu Zyklus sinken. Ein gemeinsamer Score würde beides verwässern.
- **Phasen laufen nur vorwärts** (④ Abwärtstrend → ① Akkumulation → ② Aufwärtstrend → ③ Verteilung → ④). Kein Rückweg, jeder Wechsel braucht zwei Wochenschlüsse in Folge. Das verhindert Flackern.
- **Die Wiedergabe ist die Wahrheit.** Jeder Lauf spielt die gesamte Wochenhistorie neu ab. `state.json` und `events.json` sind Ausgaben, keine Eingaben. Der Zustand kann so nicht auseinanderlaufen.

Keine Anlageberatung. Das Modell beruht auf vier Zyklen und kann falsch liegen.

---

## 2. Stand der Meilensteine

| | Inhalt | Status |
|---|---|---|
| M0 | Quellen-Check aus dem GitHub-Runner | ✅ `reports/sources-check.md` |
| M1 | Datenpipeline: Abruf, Wochenreihe, 17 Indikatorwerte | ✅ läuft wöchentlich |
| M2 | Normierung, zwei Motoren, Gates, Phasenmaschine, Backtest | ✅ kalibriert und eingefroren, `1.0` |
| M2b | Manuelle Werte, Herkunftsanzeige je Indikator | ✅ |
| M3 | Oberfläche: Ampel, Phasenleiste, Motoren, Checkliste, Kacheln | ✅ `index.html` |
| M4 | Position und Journal im Browser | ✅ in `index.html` |
| M5 | Benachrichtigungen (GitHub Issues, optional ntfy) | ✅ `scripts/notify.mjs`, im Ernstfall getestet |
| M6 | Verlauf und Zyklus-Uhr als Grafik | ✅ eigenes SVG, ohne Bibliothek |
| M7 | Härtung, Barrierefreiheit, Grenzfälle | 🔶 Prüfliste 8.5 abgearbeitet, Rest offen |

**Aktueller Marktstand laut Ampel:** Phase 4 Abwärtstrend seit 9. November 2025. Kauf-Motor 42, Verkaufs-Motor 1, Ampel gelb, „Bereit machen. Die Kaufzone rückt näher, noch nicht kaufen." Es fehlen 18 Punkte zur Kaufzone, kein Tor ist offen, 2 von 4 Indikatoren in Zone aus 2 von 3 Familien.

**Die BGeometrics-Frage ist am 13. September 2026 abschliessend beantwortet.** Ein Monatsabo Advanced, ein vollständiger Datenabzug und ein Dreifach-Nachlauf haben ergeben: Ein dauerhaftes Abo verbessert das System nicht. Einzelheiten in Abschnitt 11, die Zahlen in `reports/bgeometrics-vergleich.md`. Daraus folgt die neue Regel für die Handeingabe in Abschnitt 4a.

---

## 3. Aufbau

```
index.html             die Seite, eine Datei, ohne Abhängigkeiten
scripts/fetch.mjs      Quellen  → data/raw/          (Netzwerk, fehlertolerant)
scripts/indikator-check.mjs  Frühwarnung → reports/indikator-check.md  (jährlich)
scripts/build.mjs      data/raw → data/*.json        (Wochenauswertung + Wiedergabe)
scripts/backtest.mjs   weekly   → reports/backtest.md
scripts/notify.mjs     Benachrichtigungen (Issues, optional ntfy)
scripts/lib/sim.mjs        Simulation und Bewertung, von Backtest und Vergleich genutzt
scripts/local/             läuft NUR lokal, nie im Runner
  fetch-bgeometrics.mjs  Datenabzug BGeometrics → data/private/ (gitignored)
  compare.mjs            Vergleich → reports/bgeometrics-vergleich.md
  anker-check.mjs        Ankerpunkte und Handeingabe prüfen → reports/anker-check.md
  fetch-kerzen.mjs       Kerzenarchiv von Bitstamp → data/private/ (kein Abo nötig)
scripts/apply-manual.mjs   manuelle Werte aus einem Issue übernehmen
scripts/check-sources.mjs  Quellen-Check (M0)
engine/                reine Logik, kein Netzwerk, deterministisch
  dates.mjs      Datumshelfer, Wochendefinition
  series.mjs     SMA, EMA, Standardabweichung, Perzentil
  indicators.mjs Tages- und Wochenwerte aller Indikatoren
  normalize.mjs  Ankerpunkte, Perzentile, Hybrid → 0–100
  engines.mjs    Indikator-Scores, Familien, Abdeckung, Konvergenz, Gates
  phases.mjs     Zustandsmaschine, Tranchen, Events
  rows.mjs       weekly.json → Objekte, abgeleitete Felder
config/engine.json     alle Schwellen und Gewichte, versioniert
test/                  node:test, 40 Tests
```

### Dateien in `data/`

| Datei | Inhalt | Wer schreibt |
|---|---|---|
| `raw/*.json` | Rohdaten je Quelle, Tagesreihen | `fetch.mjs` |
| `raw/_status.json` | Erfolg oder Fehler je Quelle | `fetch.mjs` |
| `manual.json` | STH-Realized-Price von Hand | **du** |
| `weekly.json` | eine Zeile pro Sonntag seit 2010 | `build.mjs` |
| `latest.json` | aktueller Wochenstand, alles was die Seite braucht | `build.mjs` |
| `phases.json` | Phase und beide Scores je Woche (Verlauf) | `build.mjs` |
| `events.json` | alle Signale, mit `notified_at` | `build.mjs` |
| `state.json` | Zustand der Phasenmaschine (Transparenz) | `build.mjs` |
| `fixtures/*.json` | Testzustände für `?fixture=` | von Hand, statisch |
| `private/*` | BGeometrics-Abzug und Kerzenarchiv, **nie im Repo** | `scripts/local/` |

### Workflows

| Workflow | Zeitplan (UTC) | Aufgabe |
|---|---|---|
| Wochenlauf | Mo 03:10 | Tests, Daten, Auswertung, Backtest, Commit |
| Tageslauf | täglich 06:15 | Tageswerte, löst nie Signale aus |
| Backtest | manuell + bei Änderung in `config/` oder `engine/` | Report neu rechnen |
| Manuelle Werte | bei einem Issue `manual: …` vom Eigentümer | prüft und schreibt `data/manual.json` |
| Quellen-Check | manuell | prüft alle Quellen aus dem Runner |

---

## 4. Datenlage

**Verfügbar (17 Indikatoren):** MVRV-Z-Score, Realized Price, Abstand zum 200-Wochen-Schnitt, Mayer Multiple, Puell, Hash Ribbons, Drawdown, Monate seit Hoch, Zyklus-Uhr, Überdehnung über dem Trendband, Pi Cycle, Wochen extremer Angst, Gier-Niveau, Funding, Wikipedia-Aufmerksamkeit.

**Quellen:** Bitstamp (Preis seit 2011), Coin Metrics Community (On-Chain seit 2010, CC BY-NC), alternative.me, Wikimedia, Deribit, mempool.space. Kein Binance: GitHub-Runner stehen in den USA und bekommen HTTP 451.

Der Realized Price wird aus `PriceUSD ÷ CapMVRVCur` abgeleitet, weil Coin Metrics die Realized Cap nicht mehr gratis liefert. Gegenprobe September 2026: 76'676 ÷ 1,44 = 53'247, veröffentlicht waren rund 53'500.

**Fehlend (fünf Kennzahlen, nur bei BGeometrics):** STH-Realized-Price, Angebot im Verlust, Reserve Risk, RHODL-Ratio, LTH-Abgabe.

Die Nutzungsbedingungen (Stand 24.02.2026) verbieten genau unseren Aufbau, und zwar **tarifunabhängig**: Der Einsatz des Tokens von Systemen, die dem Schlüsselinhaber nicht gehören (GitHub-Runner), und jede Anwendung, die die Daten an Endnutzer ausliefert (eine öffentliche Seite), gelten als kommerzielle Weiterverbreitung und verlangen den Professional-Tarif. Auch der Advanced-Tarif deckt das nicht. Der Token liegt als Secret `BGEOMETRICS_TOKEN` bereit und wird nicht benutzt.

Die Marketing-Seite zum Zusatzmodul „Commercial Publishing" klingt milder und nimmt persönliches, nicht-kommerzielles Veröffentlichen ausdrücklich von der Lizenzpflicht aus. Die Bedingungen sind aber das bindende Dokument und widersprechen dem an diesem Punkt. Wer die Pipeline je auf BGeometrics stellen will, klärt das vorher schriftlich mit info@bgeometrics.com.

**Tarifdaten, am 13.09.2026 geprüft:** Advanced kostet 18 Dollar im Monat oder 180 im Jahr, erlaubt 200 Abrufe pro Stunde und höchstens 3 verschiedene IPs am Tag, und **hebt die Vier-Jahres-Grenze der Gratis-Stufe auf**. Alle Endpunkte kennen `/last` für den letzten Wert, `/csv` für den Export und die Parameter `day`, `startday`, `endday`. Ein Abruf holt damit eine ganze Reihe. Abos verlängern sich automatisch, also direkt nach dem Kauf kündigen.

### Manuelle Werte als Zwischenlösung

Alle fünf Kennzahlen sind auf `charts.checkonchain.com` ablesbar. In den Einstellungen der Seite gibt es je Kennzahl ein Eingabefeld, einen Knopf „↗ Chart öffnen" und den Hinweis, welche Linie abzulesen ist.

**Speichern läuft über ein Issue.** Der Knopf „✓ Speichern" öffnet GitHub mit einem vorbereiteten Issue (Titel `manual: <Woche>`, im Text der JSON-Block). Ein Klick auf „Create", und der Workflow `manual-values.yml` prüft die Werte, schreibt `data/manual.json`, kommentiert das Ergebnis und schliesst das Issue. Der nächste Wochenlauf rechnet damit.

Die Seite kann die Datei nicht selbst schreiben: Sie ist statisch und liegt im Browser, die Auswertung läuft in der Pipeline. Ein persönlicher GitHub-Token im Browser wäre technisch möglich, würde aber auch Schreibrecht auf den Code geben, den die Workflows ausführen. Dieser Weg wurde verworfen.

**Sicherheit des Workflows:** Er verarbeitet nur Issues, die mit `manual:` beginnen **und** vom Repo-Eigentümer stammen. `scripts/lib/manual.mjs` prüft zusätzlich Schlüssel, Datumsformat, Zukunftsdaten, Wertebereiche und Anzahl. Bei einem Fehler bleibt die Datei unverändert und der Grund erscheint als Kommentar.

| Kennzahl | Chart-Pfad unter `charts.checkonchain.com/` | Wirkung |
|---|---|---|
| STH-Realized-Price | `btconchain/pricing/pricing_costbasisoriginals/` | **sofort** |
| Angebot im Gewinn | `btconchain/unrealised/pctsupplyinprofit_all/` | **sofort** |
| Reserve Risk | **`charts.bgeometrics.com/reserve_risk.html`** | **sofort** |
| RHODL-Ratio | `btconchain/supply/rhodl/` | braucht Historie |
| LTH-Positionsänderung 30 T | `btconchain/supply/lthnetposchange_0/` | braucht Historie |

Alle Adressen wurden am 12. September 2026 einzeln aufgerufen und über den Seitentitel bestätigt. Sie beginnen mit `https://charts.checkonchain.com/` und enden auf `<name>_light.html`. Jede Zeile in den Einstellungen hat einen Knopf „↗ Chart öffnen" und einen Hinweis, welche Linie abzulesen ist. Der erzeugte JSON-Block enthält immer alle fünf Reihen samt bisheriger Lesungen, damit das Einfügen keine Historie löscht.
Der Unterschied: Die ersten drei nutzen absolute Ankerpunkte und wirken ab der ersten Lesung. Die letzten zwei nutzen Perzentile über vier Jahre.

**Reserve Risk wurde am 12.09.2026 von Perzentil auf hybride Bewertung umgestellt.** Die Kennzahl hat etablierte Bänder, die BGeometrics auf der eigenen Chartseite nennt: unter 0,002 Akkumulation, über 0,02 erhöhtes Risiko. Sie braucht deshalb keine Historie. Der Perzentilteil bleibt im Hybrid erhalten und greift automatisch, sobald genug Lesungen vorliegen oder BGeometrics angebunden wird.

**Achtung Skala.** Absolute Ankerpunkte hängen am Anbieter. Bei der Recherche meldete ein Anbieter Reserve Risk mit 0,00000349, während BGeometrics im Bereich 0,001 bis 0,05 liegt, also um drei Grössenordnungen daneben. Die Ankerpunkte sind auf BGeometrics und Glassnode kalibriert, die Prüfung weist Werte ausserhalb von 0,0001 bis 0,5 mit einem Hinweis ab, und der Chart-Knopf verlinkt bewusst auf BGeometrics statt auf Checkonchain. So bleibt die Reihe auch bei einer späteren Zusage von BGeometrics aus einer Quelle.

**Wirkung:** Schon eine einzige der drei sofort wirkenden Kennzahlen hebt die Abdeckung des Kauf-Motors von 80 auf 100 %. Nachgemessen mit Reserve Risk 0,0018: Score 84, Familie „Halter & Stimmung" verfügbar, Familien in Zone 2 → 3. Ein einzelner Wert wäre automatisch das 100. Perzentil und brächte den Indikator fälschlich in Zone. Deshalb gilt eine Untergrenze von 26 Wochen; darunter zählt der Indikator nicht, der Rohwert wird aber angezeigt. Wer monatlich einträgt, hat nach etwa einem halben Jahr genug Historie.

**Wichtigster Gewinn:** Mit dem Angebot im Gewinn erreicht die Familie „Halter & Stimmung" zwei von drei Mitgliedern und wird wieder wertend. Die Abdeckung des Kauf-Motors steigt von 80 auf 100 %. Nachgemessen: Kauf-Score 33 → 34, Familien in Zone 2 → 3.

**Folgen, solange nichts eingetragen ist:**

- Die Familie „Halter & Stimmung" im Kauf-Motor fällt aus (1 von 3 Mitgliedern). Abdeckung 80 %.
- Die Familie „Halterverhalten" im Verkaufs-Motor fällt aus. Abdeckung 80 %.
- Der STH-Realized-Price kommt aus `data/manual.json`. Ohne Eintrag arbeitet der Trendfilter nur mit dem Bull Market Support Band, und die Nachkauf-Chance in Phase ② ist abgeschaltet. Die Seite zeigt dafür ein Banner.
- Gate B stützt sich statt auf das Angebot im Verlust allein auf das MVRV-Perzentil.

**Bei einer Zusage:** Die fünf Kennzahlen kommen über `fetch.mjs` dazu, die Familien werden vollständig, die Konvergenzanforderung steigt automatisch zurück auf drei Familien, und die Schwelle von Weg E2 steigt von 32 auf 40. Danach muss der Backtest neu bewertet werden, weil sich beide Motoren ändern. Der Nachlauf vom 13.09.2026 zeigt, wie gross dieser Eingriff ist: siehe Abschnitt 4a.

---

## 4a. Welche Werte von Hand eingetragen werden, und welche nicht

Der Dreifach-Nachlauf (Abschnitt 11) hat eine Unterscheidung sichtbar gemacht, die vorher niemand gesehen hat. Sie ist die praktisch wichtigste Erkenntnis des ganzen Vorgangs.

| Kennzahl | Familie | Motor | Regel |
|---|---|---|---|
| Angebot im Gewinn | Halter & Stimmung | **Kauf** | monatlich eintragen |
| STH-Realized-Price | Trendfilter (ohne Score) | – | monatlich eintragen |
| Reserve Risk | Halter & Stimmung | Kauf | **zurückgestellt**, veraltete Anker |
| RHODL-Ratio | Halterverhalten | **Verkauf** | **zurückgestellt**, nachlassend |
| LTH-Positionsänderung 30 T | Halterverhalten | **Verkauf** | **zurückgestellt**, nachlassend |

**Das Angebot im Gewinn allein genügt.** Die Familie „Halter & Stimmung" braucht zwei ihrer drei Mitglieder, und Fear & Greed ist ohnehin da. Eine einzige eingetragene Kennzahl hebt die Abdeckung des Kauf-Motors damit von 80 auf 100 %. Reserve Risk wird dafür nicht gebraucht.

**Warum Reserve Risk zurückgestellt ist (Prüfung vom 13.09.2026, `reports/anker-check.md`).** Die absoluten Ankerpunkte stammen aus veröffentlichten Bändern und wurden nie gegen Daten gehalten. Gegen die volle Historie gemessen liegt der Anteil der Wochen „in Zone" bei 37,7 % bis zum Tief 2015, dann 75,5 %, dann 90,8 %, und **im laufenden Zyklus bei 100 % aller 198 Wochen**. Score am Median der Gesamthistorie: 91,8. Die Kennzahl bestätigt an den Extremen zwar zuverlässig (Score 100 an allen drei Tiefs), unterscheidet aber nichts mehr. Eingetragen würde sie den Kauf-Motor dauerhaft anheben und der Konvergenzbedingung permanent eine dritte Familie in Zone liefern.

**Warum die Hybridregel das nicht abfängt.** Sie nimmt das Maximum aus absolutem Anker und Perzentil. Das hilft gegen einen zu *strengen* absoluten Anker, und dafür wurde sie gebaut (SPEC 4.2). Gegen einen zu *lockeren* ist sie wirkungslos, weil das Maximum den hohen Wert durchreicht. Der Schutz ist asymmetrisch, und der Fehler liegt hier auf der ungeschützten Seite. Dasselbe Risiko trägt jeder absolute Anker auf einer wandernden Kennzahl.

**Warum RHODL und LTH-Positionsänderung zurückgestellt sind.** Sie vervollständigen die Familie „Halterverhalten" des Verkaufs-Motors. Dessen Abdeckung steigt damit auf 100 %, und weil die Schwelle von Weg E2 an die Abdeckung gekoppelt ist, steigt sie von 32 auf 40. Im Nachlauf mit allen fünf Kennzahlen verschwand dadurch nicht nur das knappe Signal von 2025, sondern der ganze Verkaufszyklus: Die Maschine ging im Oktober 2025 gar nicht mehr in Phase ③ und steht bis heute im Aufwärtstrend seit Januar 2023. Endvermögen 196'857 statt 314'146 USD.

Dazu kommt ein zweiter, unabhängiger Befund aus der Ankerprüfung: **Beide Kennzahlen haben aufgehört, Hochs zu markieren.** RHODL erreichte an den Hochs 2013 und 2017 Score 100, an dem von 2021 nur 57,7 und an dem von 2025 nur 15,1. Die LTH-Positionsänderung fällt von 100 über 88,1 und 82,0 auf 41,1. Sie hätten das Signal von 2025 also doppelt gekostet: über die höhere Schwelle **und** über einen niedrigeren Score. Das Zurückstellen ist damit keine Schwellenkosmetik, sondern eine belegte Aussage über zwei nachlassende Indikatoren.

**Warum „zurückgestellt" und nicht „verworfen".** Daten wegzulassen, damit eine Schwelle niedrig bleibt, wäre eine Überanpassung auf genau einen Zyklus, und SPEC 10.5 verbietet das. Die Befunde oben liefern unabhängige Gründe, aber der Kern bleibt: **Das Signal von 2025 hing an vier Punkten, und die Kopplung von Weg E2 an die Abdeckung ist die eigentliche Schwachstelle.** Sie gehört nach dem Ende des laufenden Zyklus neu bewertet, zusammen mit einer wiederholten Empfindlichkeitsprüfung (SPEC 10.3). Bis dahin bleiben die beiden Reihen leer, und die Oberfläche nennt den Grund an der Kachel.

**Zum STH-Realized-Price.** Er verschiebt keinen einzigen der zwölf Phasenwechsel. Der vereinfachte Trendfilter, der nur das Bull Market Support Band prüft, kam historisch zum selben Ergebnis. Die Einschätzung aus der alten Fassung von Abschnitt 11, er sei „der wertvollste Posten", ist damit widerlegt. Eintragen lohnt trotzdem, aber aus einem anderen Grund: Er schaltet die Nachkauf-Chance in Phase ② frei, und die kommt in der Simulation gar nicht vor, weil sie nur die sechs regulären Tranchen ausführt.

**Die Perzentilfalle entfällt damit.** Teil B der Ankerprüfung zeigt, dass eine monatlich eingetragene Kennzahl mit Perzentilanteil nach sechs Lesungen falsche Signale erzeugen kann: 26 belegte Wochen entsprechen nur rund sechs echten Messpunkten, und über das Maximum kann ein daraus errechnetes Perzentil einen korrekten absoluten Score von 0 überschreiben. Betroffen wären Reserve Risk (2,5 % der Wochen), RHODL (19,4 %) und die LTH-Positionsänderung (9,3 %). Alle drei sind jetzt zurückgestellt, und das Angebot im Gewinn wird rein absolut bewertet. Die Falle kann also nicht zuschnappen. Sie bleibt ein Thema für den Tag, an dem eine der drei zurückkommt: dann `floor_weeks` von 26 auf 104 heben oder die Untergrenze an der Zahl der Messpunkte statt der Wochen festmachen.

**Erinnerung.** `monthlyManual()` in `scripts/lib/events.mjs` erzeugt in den ersten fünf Tagen jedes Monats ein Issue vom Typ `MONTHLY_MANUAL`, sofern für den laufenden Monat noch keine Lesung in `data/manual.json` steht. Es nennt nur die noch offenen der beiden empfohlenen Kennzahlen. Kein eigener Workflow, der Tageslauf ruft `notify.mjs` ohnehin auf.

**Die Ablesung ist geprüft (13.09.2026).** `fetch-bgeometrics.mjs --check` zeigt die Werte der API, daneben wurde vom Chart abgelesen. Angebot im Gewinn: 66,07 % gegen 65,70 % abgelesen. STH-Einstand: 71'217 gegen 71'093, also 0,17 %. Das ist Ablesegenauigkeit, keine Skalenfrage, und damit ist der wahrscheinlichste Fehler ausgeschlossen: die Verwechslung zweier ähnlicher Linien im selben Diagramm. Zur Einordnung, wie genau es sein muss: Beim Angebot im Verlust bewegen sich drei Scorepunkte je Prozentpunkt, ein halbes Prozent Ableseungenauigkeit ist also ein Scorepunkt von hundert. Gegenprobe der Skala ohne Chart: Angebot im Gewinn plus Angebot im Verlust muss die Umlaufmenge ergeben, 13'268'598 + 6'814'734 = 20'083'332. Kein eigener Workflow nötig, der Tageslauf ruft `notify.mjs` ohnehin auf.

---

## 5. Kalibrierung

Vier Backtest-Läufe mit echten Daten. Jeder deckte einen Fehler auf, der nicht durch Nachdenken, sondern nur durch Daten sichtbar wurde.

| Lauf | Änderung | BTC am Ende | Was sie aufdeckte |
|---|---|---|---|
| 1 | Startkonfiguration | 2,68 | 2017 und 2025 verpasst |
| 2 | Abdeckungsschwelle 70 → 60 % | 2,68 | 2017 war blind: vor Februar 2018 fehlen Fear & Greed und Funding, der Verkaufs-Motor kam nur auf 65 % |
| 3 | Konvergenz zählt nur wertende Familien | 3,32 | 2017 sitzt (Score 100 in der Hochwoche), 2025 scheiterte um vier Punkte |
| 4 | E2-Schwelle × Abdeckung | ≥ 3,32 | 2025 sitzt mit 0,83 × |

### Ergebnis nach Lauf 4

| Extrem | Phase-Eintritt | Abstand | Ø Preis | Verhältnis | Ziel | |
|---|---|---|---|---|---|---|
| Tief 2015 | 2015-01-11 | 0 W | – | – | ≤ 1,6 × | Zeitpunkt exakt, kein Startkapital |
| Tief 2018 | 2018-12-02 | −2 W | 4'364 | 1,36 × | ≤ 1,6 × | ✓ |
| Tief 2022 | 2022-06-26 | −21 W | 22'103 | 1,43 × | ≤ 1,6 × | ✓ |
| Hoch 2013 | – | – | – | – | ≥ 0,6 × | ausserhalb des Datenbereichs |
| Hoch 2017 | – | −9 W | 10'831 | 0,55 × | ≥ 0,6 × | ✗ Parabel bei 65 % Abdeckung |
| Hoch 2021 | – | +5 W | 50'124 | 0,73 × | ≥ 0,6 × | ✓ |
| Hoch 2025 | – | +5 W | 104'705 | **0,83 ×** | ≥ 0,6 × | ✓ bestes Ergebnis |

Fünf von sieben Kriterien erfüllt. Beide Ausnahmen sind erklärt: 2015 fehlte in der Simulation das Startkapital (sie beginnt mit 1 BTC und ohne Cash), 2017 war eine Blow-off-Parabel, die sich in den letzten sechs Wochen verdreifachte, bei nur halber Datenlage.

**2017 wird bewusst nicht nachjustiert.** Jede Schwellenverschiebung, die 2017 verbessert, verschlechtert 2021 oder 2025. SPEC 10.5 verbietet die Optimierung auf einen einzelnen Zyklus, und vier Zyklen sind eine sehr dünne Datenbasis.

### Empfindlichkeitsprüfung: bestanden, Konfiguration eingefroren

Jede der fünf wichtigsten Schwellen wurde einmal um 15 % nach oben und einmal nach unten verschoben.

| Ergebnis | Anzahl |
|---|---|
| unverändert, 4 von 7 Kriterien | 8 von 10 |
| ein Kriterium verloren (Hoch 2025), 3 von 7 | 2 von 10 |

Die beiden Ausreisser sind `gates.sell_E2.halving_days_min` ×1,15 (480 → 552 Tage, das Hoch lag bei 533) und `gates.sell_E2.score_min` ×1,15 (40 → 46). Beide machen Weg E2 strenger und verlieren dasselbe Signal. Kriterium aus SPEC 10.3 erfüllt: keine Verschiebung kostet mehr als ein Kriterium.

**Zur Lesart der Tabelle.** Die erste Fassung zeigte nur BTC am Ende, was in die Irre führte: 1,3277 BTC sahen schlechter aus als 3,3192. Tatsächlich sind 1,3277 genau 40 % von 3,3192, also die Kernposition. Die Läufe mit weniger BTC haben 2025 verkauft und halten Cash. Nachgerechnet: 1,9915 BTC zu 104'705 ergeben 207'479 USD, das Gesamtvermögen steigt von 266'661 auf 314'144 USD, also **18 % mehr**. Der Bericht zeigt deshalb jetzt das Gesamtvermögen und die konkret verlorenen Kriterien.

**Bekannte Schwachstelle: das Signal von 2025 ist der wackeligste Teil des Systems.** Verkauf-Score 36 bei einer wirksamen Schwelle von 32. Das ist knapp. Wird E2 auch nur etwas strenger, oder fällt die Abdeckung des Verkaufs-Motors (dann steigt die gekoppelte Schwelle), verschwindet das Signal. Das ist kein Fehler, sondern spiegelt, dass 2025 ein wirklich leises Hoch war. Es ist bewusst nicht wegoptimiert, aber beim nächsten Zyklus im Auge zu behalten.

**Am 13.09.2026 bestätigt, und zwar deutlicher als erwartet.** Der Nachlauf mit vollständiger Datenlage verliert nicht nur das Signal, sondern den gesamten Verkaufszyklus 2025 (Abschnitt 4a). Die Empfindlichkeitsprüfung hatte dasselbe Muster schon gezeigt: Beide Ausreisser von zehn Verschiebungen betrafen Weg E2. Drei unabhängige Prüfungen zeigen damit auf dieselbe Stelle.

**Am 18.09.2026 kam eine vierte dazu, auf einem anderen Rechenweg, und sie ist die deutlichste.** Die Indikator-Prüfung misst je Zyklus den höchsten Wert, den der Verkaufs-Motor überhaupt erreicht hat:

| | bis 2015 | bis 2018 | bis 2022 | seit 2022 |
|---|---|---|---|---|
| höchster Wert Verkaufs-Motor | 58 | 100 | 59 | **37** |
| Wochen in Zone (ab 60) | 0,0 % | 9,8 % | 0,0 % | 0,0 % |
| höchster Wert Kauf-Motor | 79 | 94 | 96 | 92 |

Zwei Dinge stehen damit fest. Erstens: **Der Kauf-Motor ist unauffällig**, seine Höchstwerte schwanken ohne Trend zwischen 79 und 96. Das Problem liegt ausschliesslich auf der Verkaufsseite. Zweitens: Der Höchstwert des laufenden Zyklus liegt bei **37**. Weg E2 verlangt 40 bei voller Datenlage und 32 bei der heutigen Abdeckung von 80 %. Mit vollständigen Daten hätte der Verkaufs-Motor also **im gesamten Zyklus an keiner einzigen Woche** ausgelöst; es fehlten nicht drei Punkte in einer Woche, sondern drei Punkte im ganzen Zyklus. Beim heutigen Stand hat er ausgelöst, aber **der Puffer beträgt fünf Punkte**.

Dazu passen die fünf Indikatoren, die im laufenden Zyklus als verstummt gelten. Alle fünf gehören zum Verkaufs-Motor, keiner zum Kauf-Motor, und sie sinken über alle vier Zyklen gleichmässig: pi_cycle 28,6 → 8,3 → 6,8 → 0,0 %, bmsb_ext 27,9 → 11,8 → 9,2 → 0,5 %, mvrv_z (Verkauf) 27,2 → 15,7 → 6,8 → 0,5 %. In die Gegenrichtung geht nur `p_200w` auf der Kaufseite, von 0,0 auf 27,1 %. Beides beschreibt dasselbe: **Die Ausschläge werden kleiner, oben schneller als unten.**

Nach dem Zyklusende gehört deshalb nicht nur die Kopplung `score_min × Abdeckung` neu durchdacht, sondern die Frage, ob der Verkaufs-Motor in seiner heutigen Form beim nächsten Hoch überhaupt noch auslösen kann. Die Datenlage künstlich klein zu halten löst das nicht.

**Konfiguration `1.0` ist eingefroren** und wird erst nach dem Ende des laufenden Zyklus neu bewertet (SPEC 10.5). Eine Ausnahme: Kommen die BGeometrics-Kennzahlen dazu, ändern sich Abdeckung und die gekoppelte E2-Schwelle, dann muss der Backtest neu bewertet werden.

---

## 5a. Was die Buchauswertung beigetragen hat

Am 18.09.2026 wurden sechs Zusammenfassungen von 17 Büchern durchgesehen (Bitcoin-Fundamentals, Geldsystem, Trading-Psychologie, Trading-Systeme, Market Wizards und Spekulationsgeschichte, Zyklen und Ungewissheit). Ergebnis: **Der grösste Teil überträgt sich nicht**, und das ist eine Feststellung, keine Bescheidenheit. Dreizehn der Bücher behandeln Trading mit Stops, Positionsgrössen je Trade und Einstiegstiming. Die Ampel hat keinen Hebel, keinen Stop-Loss und handelt sechsmal je Zyklus. Van Tharps R-Multiple setzt einen definierten Stop voraus und mindestens 50 Trades; hier gibt es 15 in zwölf Jahren. Das zu übertragen wäre genau die Narrative Fallacy, vor der Taleb warnt.

Vier Beiträge bleiben.

**1. Die Frage nach dem Ausstieg** (Jim Paul: erst bestimmen, wo man aussteigt, dann wo man einsteigt). Sie führte direkt zum Befund über die Verkaufsseite in Abschnitt 5. Das ist der wertvollste Ertrag der Auswertung, und er kam nicht aus einem Buch, sondern aus einer Frage, die ein Buch gestellt hat.

**2. Silent Evidence im Backtest** (Taleb). Alle vier Zyklen der Stichprobe sind Zyklen, in denen Bitcoin sich wieder erholt hat. Die Abnahmekriterien messen durchweg gegen Tiefs, auf die ein Anstieg folgte. Kein Fall im Sample ist einer, in dem es nicht weiterging. Das macht die Kriterien nicht falsch, aber es ist eine benannte Grenze: **Die Ampel ist auf einem Sample kalibriert, das auf Überleben bedingt ist.** Sie kann prinzipiell nicht messen, wie sie sich verhielte, wenn ein Zyklus nicht zurückkehrt.

**3. Bitcoin-Dominanz als vorab festgelegter Kandidat für 2.0** (Chancellor). In jeder Blase wandert Kapital in immer schlechtere Objekte: von Semper Augustus zu breeder bulbs, von Blue Chips zu Penny Stocks. In Krypto ist das als Bitcoin-Dominanz messbar (BTC-Marktkapitalisierung geteilt durch die des Gesamtmarkts), und die Reihe ist gratis und rückwirkend erhältlich. Sie gehörte in die Familie „Euphorie" des **Verkaufs**-Motors, also genau in die Familie, die laut Indikator-Prüfung verstummt ist (`retail_attention` 0,0 %, `funding_30d` 0,0 %, `fng_4w` 6,5 %).

*Vorab festgehalten, damit es später keine Rückschau wird:* Getestet wird, ob die Dominanz an den vier bekannten Zyklushochs im oberen Bereich ihrer eigenen Vier-Jahres-Verteilung liegt und an den Tiefs nicht. Als Ergebnis gilt eine Trennschärfe über 40 Punkten nach der Methode aus `compare.mjs`. Wird sie verfehlt, ist der Kandidat erledigt und wird **nicht** durch einen anderen ersetzt, der im Rückblick besser aussieht.

**4. Die Auflösung der zentralen Spannung.** Durch alle sechs Dateien zieht sich derselbe ungelöste Widerspruch: Ammous und Boyapati sagen halten, Tharp und die Turtles sagen Stops setzen und Risiko managen. Die Ampel beantwortet das bereits, nur stand es nirgends: **Die Kernposition ist der HODL-Teil, die Tranchen sind der gesteuerte Teil.** Strukturell ist das Talebs Barbell — ein unangetasteter Kern plus ein begrenzter, regelgebundener Anteil, und bewusst nichts dazwischen. Das ist auch die Antwort auf die naheliegendste Kritik am System, das Fehlen eines Stop-Loss: Ein Stop-Loss wäre hier falsch, weil die Kernposition gar nicht verkauft werden soll und der gesteuerte Teil über Phasen statt über Preisschwellen arbeitet.

**Nicht übernommen:** R-Multiples und Expectancy (kein Stop, zu wenige Trades), Positionsgrössen je Trade (durch die Tranchenlogik ersetzt), Zeitstop auf Wochenebene (die zwei bestätigten Wochen leisten dasselbe), sämtliche Intraday-Technik.

---

## 6. Die Oberfläche

`index.html` ist eine einzelne Datei ohne Abhängigkeiten, in der Gestaltung des Cockpits, mit einer senkrechten Ampel als einzigem lautem Element.

**Aufbau auf dem Desktop (ab 960 px), drei Bereiche:**

- Oben links, 400 px: Ampel mit Handlungssatz und Betrag, Phasenleiste, beide Motoren, Checkliste „bis zum nächsten Schritt". Das ist die Antwort auf „Was tun?".
- Oben rechts: Zyklus-Uhr und Position. Beide Bereiche sind absichtlich etwa gleich hoch, eine kurze Spalte neben einer langen wirkt unfertig.
- Darunter über die volle Breite: Indikator-Kacheln im Dreierraster, Verlauf, Journal.

Auf dem Handy stapelt sich alles in derselben Reihenfolge.

Der Verlauf ist ein selbst gezeichnetes SVG aus `data/phases.json`, logarithmisch, mit den Phasen als Hintergrundbänder und Dreiecken für die Tranchen. Keine Chart-Bibliothek.

Position, erledigte Tranchen und Journal liegen ausschliesslich im Browser (`localStorage`, Präfix `zy_`), mit Export und Import. Sie gehen nie ins Repo.

**Schutzmechanismen.** Die Seite prüft beim Laden, ob der Wochenstand aus M2 stammt. Eine ältere Datei ohne `phase`, `engines` und `action` führt zu einer klaren Meldung statt zu einer leeren Seite. Ein `try`/`catch` fängt Darstellungsfehler ab, und der Verlauf ist eigens abgesichert, damit er die Seite nie umwirft.

**Testzustände:** `?fixture=kauf-tranche`, `?fixture=verkauf`, `?fixture=datenluecke` laden eine Datei aus `data/fixtures/` statt `data/latest.json`.

**Herkunft jeder Zahl.** Jede Kachel trägt eine Rechenzeile mit den tatsächlich eingesetzten Werten, etwa `(1.61 Bio. − 1.07 Bio.) / 611.70 Mrd.` für den MVRV-Z-Score. Sie wird in der Pipeline fertig gebaut (`source_calc.compact`), nicht im Browser zusammengesetzt: Ein früherer Versuch verkettete alle Operanden mit einem Geteiltzeichen und stellte damit die Formel falsch dar. Als Divisionszeichen dient ein Schrägstrich, weil ein Geteiltzeichen bei 11 Pixel seine Punkte verliert und wie ein Plus aussieht. Das Erklär-Sheet zeigt zusätzlich Formel, alle Operanden und den Hinweis auf den Wochenschluss.

**Aktualisieren.** Ein Knopf oben rechts lädt die Daten mit Cache-Umgehung neu und zeichnet alles neu.

**Erklär-Sheets an zwei Karten.** Neben „Motoren" und „Bis Phase …" steht ein Fragezeichen, das dasselbe Sheet öffnet wie die Indikator-Kacheln (`infoSheet()`, gemeinsame Hülle, gleiche Fokusfalle). Beide Karten zeigten vorher Zahlen, die ohne Vorwissen nichts sagen: Familien, Zonen, Tor A und B, die Konvergenzzeile, der Zähler „bestätigte Wochen".

Drei Fassungen waren nötig, und die Lehre daraus steht hier, damit sie niemand wiederholt. Die erste mit 700 Wörtern war ein Aufsatz. Die zweite mit 240 Wörtern war kurz, aber weiterhin unverständlich, weil sie **definierte** statt zu zeigen. Erst die dritte funktioniert: Sie arbeitet mit den Zahlen, die gerade auf dem Schirm stehen. Das Motoren-Sheet listet die eigenen Familien mit Gewicht und aktuellem Wert, nennt namentlich die Indikatoren, die gerade in Zone stehen, und zeigt beide Tore mit ihrem Zustand. Das Checklisten-Sheet geht die Bedingungen der Karte einzeln durch und erklärt jede über einen Mustervergleich auf das Label. **Erklären heisst hier: mit den eigenen Daten arbeiten, nicht Begriffe definieren.**

Zwei Fehler dabei gefunden: Die Sheets lasen `confluence.of`, das es nicht gibt (richtig ist `need_indicators`), und die Liste der Indikatoren „in Zone" wurde selbst nachgerechnet statt aus `confluence.ids` gelesen, was in einer Fixture 2 statt 6 ergab. Beides behoben. Gegenprobe war ein Harness, das beide Sheets gegen alle drei Fixtures durchspielt und auf `undefined` und `NaN` prüft.

**Ungleich hohe Spalten, bewusst so gelassen.** Links stehen vier Karten, rechts zwei, unten rechts bleibt eine Lücke. Gemessen am 13.09.2026: links 707 px, rechts 528. Zwei Auswege wurden probiert und verworfen. Die rechte Spalte auf volle Höhe zu strecken erzeugt eine leere Karte, die wie ein Fehler aussieht. Eine Karte hinüberzuschieben dreht die Lücke nur um (Checkliste nach rechts: 531 zu 720). Die einzige Zuordnung, die heute fast aufgeht, wäre die Zyklusphase nach rechts über die Zyklus-Uhr (590 zu 645), aber die Kartenhöhen hängen vom Inhalt ab: Die Checkliste wächst mit der Zahl der Bedingungen, die Positionskarte mit den erledigten Tranchen. Jede feste Zuordnung driftet wieder weg. Die Lücke bleibt deshalb stehen.

**Zyklus-Uhr.** Die Achse reicht bis 720 Tage nach dem geschätzten Halving, damit das Top-Fenster vollständig hineinpasst. Beschriftungen an den Rändern rücken links- beziehungsweise rechtsbündig. Mit echten Daten geprüft: letztes Hoch bei 0 %, Tief-Fenster 17 bis 30 %, heute 20,7 %, Halving 55,4 %, Top-Fenster 83,3 bis 95 %.

**Verlauf.** Liest zusätzlich `events.json` und zeichnet **alle** Tranchen der Historie ein, nicht nur die des laufenden Zyklus. Mehrere Tranchen derselben Woche und Richtung werden zu einer Marke zusammengefasst. Die Legende nennt Tranchen, nicht Transaktionen: Es sind 18 Signale, von denen die Simulation 12 ausführte (2015 fehlte das Startkapital).

**Tranchen-Chips.** Vier Zustände: offen, in dieser Woche fällig (amber), erledigt, übersprungen. Eine früher ausgelöste Tranche zeigt neutral ihr Datum. Ein gesetztes Datum heisst nicht „fällig": Die Liste trägt die Werte des laufenden Zyklus bis zum nächsten Eintritt in Phase ① mit, sonst stünden in Phase ④ alle sechs Chips fälschlich auf fällig.

**Barrierefreiheit, geprüft am 13.09.2026 gegen SPEC 8.5.** Vieles war schon richtig: Die Ampel trägt `role="img"` mit sprechendem `aria-label`, die einzelnen Lampen sind `aria-hidden`, der Handlungssatz liegt in einem Bereich mit `aria-live="polite"`, die Indikator-Kacheln sind echte `<button>` und damit mit der Tastatur erreichbar, `:focus-visible` ist sichtbar gesetzt, Escape schliesst das Sheet, `prefers-reduced-motion` ist berücksichtigt. Alle Textkontraste liegen über 4,5:1, der schwächste ist `--mut` auf Karte mit 4,94:1.

Vier Lücken wurden geschlossen:

| Lücke | Befund | Behebung |
|---|---|---|
| Fokus im Sheet | Tab lief hinter das Overlay, nach dem Schliessen war die Stelle in der Seite verloren | Fokusfalle im Sheet, Rückgabe an das auslösende Element (WCAG 2.1.2, 2.4.3) |
| Tippflächen | `.btn` kam auf rund 38 px, der Chart-Knopf ähnlich | `min-height:44px` |
| Rahmenkontrast | `--line` erreicht gegen die Karte nur 1,23:1, WCAG 1.4.11 verlangt 3:1 für bedienbare Elemente | neue Variable `--edge` mit 3,01:1, nur für Knöpfe und Eingaben; `--line` bleibt für dekorative Trenner |
| Ladezeit | `phases.json` und `events.json` wurden sofort beim Laden geholt | `IntersectionObserver` mit 400 px Vorlauf, Rückfall auf sofortiges Laden, wenn er fehlt |

Beim Verzögern des Verlaufs entstand kurz ein Rückschritt: Die Sperre gegen doppeltes Laden machte den Aktualisieren-Knopf wirkungslos. `loadHistory(true)` umgeht sie, der Knopf holt also weiterhin frische Daten.

**Noch offen aus M7:** Antippen des Verlaufs für Details zu einer Woche, Systemsignale aus `events.json` im Journal, Prüfung mit einem echten Screenreader, Messung der ersten Anzeige auf einem Handy. Erledigt nebenbei: Erklär-Sheets für die beiden Karten, die ohne Vorwissen nicht lesbar waren.

---

## 7. Abweichungen von der ursprünglichen Spezifikation

Alle sind in `SPEC.md` eingearbeitet. Hier die Begründungen:

| Thema | Alt | Neu | Warum |
|---|---|---|---|
| On-Chain-Rückgriff | 3 Tage, Höchstalter 10 Tage | Rückgriff 10 Tage, „alt" ab 4 Tagen | Die beiden Regeln widersprachen sich. Coin Metrics hinkt regelmässig 1 bis 2 Tage nach. |
| Zyklus-Uhr ohne relevantes Halving | fehlender Wert | Score 0 | Als „fehlt" wäre die Familie „Zeit & Trend" (Innengewicht 25 von 40) unter die 50-Prozent-Regel gefallen. Der Verkaufs-Motor wäre in den Phasen ② und ③ dauerhaft blind gewesen. |
| Konvergenz | fest 3 Familien | `min(3, verfügbare Familien)`, mindestens 2 | Eine Kauf-Familie fehlt dauerhaft. Ein Signal darf nicht daran scheitern, dass eine Quelle nicht lizenziert ist. |
| Konvergenz-Zählung | alle Familien mit einem Indikator in Zone | nur Familien, die in den Score eingehen | Sonst war die Bedingung leichter zu erfüllen als der Score selbst. Sichtbar an der unmöglichen Meldung „4 Familien (3 verfügbar)". |
| Mindestabdeckung | 70 % | 60 % | Ohne Fear & Greed und Funding erreicht der Verkaufs-Motor nur 65 %. Mit 70 % war er bis 2018 blind. |
| Reserve Risk | nur Perzentil | Hybrid: absolute Bänder plus Perzentil | Die Bänder sind etabliert und vom Anbieter dokumentiert. Damit wirkt eine einzelne Handeingabe sofort, statt 26 Wochen Historie zu brauchen. |
| Schwelle von Weg E2 | fest 40 | 40 × Abdeckung | Mit einer dauerhaft fehlenden Familie sind 20 Gewichtspunkte unerreichbar. Deshalb wurde 2025 um vier Punkte verfehlt. Weg E1 bleibt ungekoppelt, damit der Pfad der Überhitzung in einer Parabel nicht zu früh öffnet. |
| Trendbruch-Meldung | nur bei offenen Tranchen | immer beim Übergang ③ → ④ | Der Trendbruch ist auch dann wichtig, wenn nichts mehr zu verkaufen ist. |
| Desktop-Layout | zwei Spalten | drei Bereiche | Zwei Spalten wurden ungleich hoch, die Kacheln nutzen die volle Breite besser. |
| Spaltenhöhe | „absichtlich etwa gleich hoch" (SPEC 8.2) | ungleich, Lücke unten rechts bleibt | Kartenhöhen hängen vom Inhalt ab. Strecken erzeugt eine leere Karte, Umsortieren dreht die Lücke nur um. Begründung in Abschnitt 6. |
| Rechenzeile der Kacheln | im Browser aus den Operanden verkettet | fertig aus der Pipeline (`source_calc.compact`) | Die Verkettung stellte die Formel falsch dar, etwa „MC ÷ RC ÷ σ" statt „(MC − RC) ÷ σ". |
| Divisionszeichen | ÷ | / | Bei 11 Pixel verliert ÷ seine Punkte und sieht aus wie ein Plus. |

---

## 8. Betrieb im Alltag

**Normalfall: nichts tun.** Die Pipeline läuft montags, die Seite zeigt den Stand, und bei Handlungsbedarf kommt ein GitHub-Issue als E-Mail und Push. Das offene Issue ist der Merkposten; du schliesst es, wenn die Tranche ausgeführt ist.

| Anlass | Was zu tun ist |
|---|---|
| Signal-Issue kommt | Seite öffnen, Handlungssatz und Betrag lesen, Tranche ausführen, auf „Erledigt" tippen, Issue schliessen |
| Monatsanfang, Issue kommt von selbst | Angebot im Gewinn und STH-Realized-Price ablesen, in den Einstellungen eintragen, speichern. Hebt die Abdeckung des Kauf-Motors von 80 auf 100 %. Reserve Risk, RHODL und LTH-Positionsänderung bewusst **nicht** eintragen (Abschnitt 4a) |
| Technik-Issue kommt | Actions-Tab prüfen, meist eine ausgefallene Quelle |
| einmal im Jahr (1. Januar) | Review-Issue abarbeiten: Backup exportieren, Kernposition prüfen, Quellenstatus ansehen |
| nach einem abgeschlossenen Zyklus | Backtest neu bewerten, Konfiguration gegebenenfalls auf 2.0 |

**Nach jeder Code-Änderung, welche die Ausgabestruktur betrifft:** einmal den Wochenlauf von Hand starten. `latest.json` entsteht nur dort. Reine Darstellungsänderungen brauchen nur Strg+F5.

**Reihenfolge beim Übertragen:** Archiv entpacken, `git add -A`, `git commit`, **`git pull --rebase`**, `git push`. Die Pipeline committet jeden Montag selbst, ohne das Rebase wird der Push abgelehnt.

---

## 9. Fallstricke

| Thema | Merksatz |
|---|---|
| `latest.json` nach Engine-Änderungen | Die Datei entsteht **nur** im Wochenlauf. Nach jedem Push, der die Ausgabestruktur ändert, den Workflow einmal von Hand starten, sonst zeigt die Seite den alten Stand. Genau das ist einmal passiert. |
| Push wird abgelehnt | Die Pipeline committet jeden Montag selbst. Immer erst `git pull --rebase`, dann `git push`. |
| PowerShell | Mehrere Zeilen auf einmal einfügen kann die Reihenfolge umdrehen. Jede Zeile einzeln abschicken. |
| Archiv aus `Downloads` | Der Browser legt gleichnamige Dateien als `… (1).zip` ab. Altes Archiv vorher löschen oder den Dateinamen versionieren. |
| Zeitzone | Alles UTC. Die Woche endet Sonntag 24:00 UTC, ein Wochenschluss ist erst ab Montag 00:00 UTC gültig. |
| Binance | In der Pipeline nicht verwendbar (HTTP 451 aus US-Rechenzentren). Im Cockpit funktioniert es, weil der Browser abruft. |
| Kein Blick in die Zukunft | Perzentile und Standardabweichungen dürfen nur Vergangenheit sehen. Dafür gibt es je einen Test in `engine.test.mjs` und `engines.test.mjs`. Bei Änderungen an `series.mjs` oder `engines.mjs` nicht entfernen. |
| Abdeckung vor 2018 | Ohne Fear & Greed (ab Feb. 2018) und Funding (ab 2019) erreicht der Verkaufs-Motor nur 65 %. Die Schwelle von 60 % darf nicht ohne Not angehoben werden. |
| Startkapital im Backtest | 1 BTC, kein Cash. Käufe vor dem ersten Verkauf sind nicht finanzierbar. Für Tiefs zählt der Zeitpunkt des Phaseneintritts, nicht der Kaufpreis. |
| Öffentliches Repo | Bestände, Kaufpreise und Beträge gehören nie ins Repo. |
| GitHub-Inaktivität | Nach 60 Tagen ohne Aktivität deaktiviert GitHub geplante Workflows. Die wöchentlichen Commits sollten das verhindern. |
| Überanpassung | Vier Zyklen sind wenig. Schwellen vorab festlegen, nicht nachträglich suchen. |

---

## 10. Warum Nachrechnen andere Zahlen ergibt

Ein Abgleich gegen Checkonchain am 12. September 2026 (Tageskurs 77'123) ergab durchgehend Abweichungen. Alle haben systematische Ursachen, keine ist ein Fehler.

| Indikator | Ampel | nachgerechnet | Ursache |
|---|---|---|---|
| Abstand zum Realized Price | 1,51 | 1,45 | Wochenschluss 80'339 statt Tageskurs 77'123. Der Realized Price selbst stimmt auf 0,03 % (53'204 gegen 53'187). |
| Abstand zum 200-Wochen-Schnitt | 1,24 | 1,18 | Wochenschluss. Der Schnitt selbst weicht um 0,6 % ab (64'790 gegen 65'176), weil die Ampel Sonntagsschlüsse von Bitstamp nimmt. |
| Mayer Multiple | 1,15 | 1,10 | Wochenschluss. Der 200-Tage-Schnitt weicht um 0,4 % ab. |
| Puell Multiple | 1,13 | 1,08 | Stichtag der On-Chain-Daten, und die Ampel bewertet nur die Neuemission ohne Gebühren. |
| Abstand vom Allzeithoch | −35,6 % | −38,9 % | Doppelt: Wochenschluss statt Tageskurs, und höchster **Tagesschluss** (124'728) statt Intraday-Spitze (126'200). |
| MVRV-Z-Score | +0,89 | −0,89 | **Definitionsunterschied**, nicht nur ein Vorzeichen. |

**Die zwei Hauptursachen:**

1. **Wochenschluss statt Tageskurs.** Das ist der Kern des Konzepts: Signale werden ausschliesslich auf Wochenschlüssen geprüft, sonst flackern sie. Lag der Tageskurs 4 % unter dem letzten Wochenschluss, weichen alle preisbasierten Indikatoren um etwa 4 % ab.
2. **Tagesschlüsse statt Intraday.** Auch das Allzeithoch ist ein Tagesschluss. Eine Spitze, die nur Minuten hielt, ist kein Schluss.

**Zum MVRV-Z-Score.** Die Ampel nutzt die klassische Definition nach Awe & Wonder: (Marktkapitalisierung − Realized Cap) ÷ Standardabweichung der Marktkapitalisierung. Dieser Wert ist immer positiv, solange der Preis über dem Realized Price liegt, also aktuell notwendigerweise. Ein negativer Wert von −0,89 kann nur aus einer anderen Rechnung stammen, typischerweise einem rollierenden Z-Wert des MVRV-*Verhältnisses* gegen seinen eigenen Mehrjahresschnitt. Beide beschreiben dasselbe Marktbild: Bitcoin liegt über dem Einstandswert, aber unter seinem eigenen Mehrjahresdurchschnitt. Die Ampel drückt das zweite über das Perzentil aus, aktuell das 43. Die Ankerpunkte sind auf die klassische Definition kalibriert und im Backtest an den Tiefen 2015, 2018 und 2022 bestätigt. Sie werden deshalb nicht umgestellt.

Die Seite zeigt die Herkunft jetzt selbst: Jede Kachel trägt eine Rechenzeile mit den eingesetzten Zahlen, und das Erklär-Sheet nennt Formel, alle Operanden und den Hinweis auf den Wochenschluss.

**Nachtrag 13.09.2026: die Definitionsfrage ist erledigt.** Der Abgleich über 791 Wochen gegen BGeometrics ergibt für den MVRV-Z-Score Korrelation 1,0000 bei 0,5 % mittlerer Abweichung. Beide rechnen also dieselbe klassische Definition, und die Ankerpunkte sitzen auf der richtigen Skala. Der abweichende Wert von −0,89 stammte von einer dritten Quelle mit anderer Formel. Ebenso bestätigt: der abgeleitete Realized Price auf 0,1 % über 843 Wochen, der 200-Wochen-Schnitt auf 0,4 %, das Allzeithoch auf 0,6 %. BGeometrics nimmt für das Allzeithoch ebenfalls den höchsten Tagesschluss, nicht die Intraday-Spitze.

Zwei Abweichungen sind beziffert statt vermutet. Der **Puell Multiple** weicht um 8,6 % ab, weil wir nur die Neuemission bewerten und BGeometrics die Gebühren mitzählt. Da unsere Ankerpunkte absolut sind, verschiebt das den Score leicht; notieren, nicht ändern. Die **Wikipedia-Aufrufe** liegen 19,5 % daneben bei Korrelation 0,9994, also gleiche Form, anderes Niveau, weil wir zwei Sprachen summieren. Ohne Wirkung, weil der Indikator über sein eigenes Perzentil bewertet wird.

Ein Punkt bleibt offen: **Funding** erreicht nur Korrelation 0,85 über 240 Wochen, deutlich schwächer als alles andere. Wir holen Deribit BTC-PERPETUAL, BGeometrics mittelt über mehrere Börsen. Der Indikator trägt rund 5 von 100 Gewichtspunkten, das ist verkraftbar, aber er ist der unsicherste der Sammlung.

---

## 11. Beantwortet: BGeometrics lohnt sich nicht

Am 13. September 2026 wurde ein Monatsabo Advanced gelöst (18 Dollar, sofort gekündigt), vollständig abgezogen und ausgewertet. Die Frage ist damit erledigt. Rohdaten in `data/private/` (gitignored), Bericht in `reports/bgeometrics-vergleich.md`.

**Der Abzug.** 68 Reihen, fast alle mit voller Historie zurück bis 2009 oder 2010. Der Advanced-Tarif hebt die Vier-Jahres-Grenze tatsächlich auf. `scripts/local/fetch-bgeometrics.mjs` kennt dafür vier Modi: `--list` zeigt den Katalog ohne Netz, `--probe` sucht Server und Pfade über `/last`, der Normallauf zieht über `/csv` ab, `--repair` setzt offline die richtige Spalte als Hauptwert und rechnet Ableitungen aus.

**Zwei Stolpersteine nebenbei.** `--probe` schrieb die Pfadliste anfangs komplett neu, statt sie zu ergänzen; ein Lauf mit `--only=…` löschte damit alle übrigen Pfade. Behoben, die Probe führt jetzt zusammen und meldet beim Start, wie viele Pfade sie kennt. Und `fetch-kerzen.mjs` brach ab, sobald eine Seite weniger als 1000 Zeilen lieferte; in den frühen Jahren fehlen einzelne Kerzen, eine volle Seite hat dann 997 Zeilen. Es läuft jetzt bis zur Gegenwart und bricht nur ab, wenn der Zeitstempel nicht mehr vorwärts geht.

**Stolperstein bei den Spalten.** Viele Endpunkte antworten mehrspaltig, und die erste Spalte ist fast immer `priceUsd`. Der Abzug speichert deshalb jetzt **alle** Spalten, nicht nur eine geratene. Ausserdem liefert BGeometrics das Angebot im Gewinn als Menge in Bitcoin, nicht in Prozent; `supply_in_profit_pct` wird daraus lokal gerechnet (Gewinn ÷ (Gewinn + Verlust) × 100).

### Die drei Ergebnisse

**1. Die freie Pipeline trägt.** Zwölf Kennzahlen im Abgleich, die meisten mit Korrelation 1,0000 und unter 1 % Abweichung. Einzelheiten in Abschnitt 10. Für ein Abo gibt es von dieser Seite kein Argument: Coin Metrics, Bitstamp und die eigene Rechnung liefern dieselben Zahlen.

**2. Die fünf fehlenden Kennzahlen verschlechtern das System.** Drei vollständige Nachläufe über 843 Wochen:

| Variante | Endvermögen | BTC | Cash | Transaktionen | Kriterien |
|---|---|---|---|---|---|
| ohne Zusatzdaten (Stand heute) | 314'146 | 1,3277 | 207'481 | 15 | 4 von 7 |
| nur STH-Einstand | 314'146 | 1,3277 | 207'481 | 15 | 4 von 7 |
| mit allen fünf | 196'857 | 2,4503 | 0 | 12 | 3 von 7 |

Ursache und Konsequenz stehen in Abschnitt 4a. Kurz: Weg E2 wird strenger, der Verkaufszyklus 2025 fällt weg. Zusätzlich verschlechtert sich 2017 von 0,55 × auf 0,37 ×.

**3. Der STH-Einstand ist nicht der wertvollste Posten.** Die Spalte „nur STH-Einstand" ist Zeichen für Zeichen identisch mit „ohne Zusatzdaten", kein einziger der zwölf Phasenwechsel verschiebt sich. Die frühere Einschätzung in diesem Abschnitt war falsch. Einschränkung: Die Simulation führt nur die sechs regulären Tranchen aus, die an ihm hängende Nachkauf-Chance kommt darin nicht vor.

### Zur Rangliste der Kandidaten

Der Bericht misst für 38 zusätzliche Reihen, wo sie an den bekannten Zyklustiefs und Zyklushochs innerhalb ihrer eigenen Vier-Jahres-Historie standen (Fenster ± 8 Wochen, nur Vergangenheit sichtbar). Fünfzehn kommen über 40 Punkte Trennschärfe, aber die Liste täuscht:

- **Die Spitze misst dasselbe nochmal.** AVIV (+67,7), Realized Mayer (+67,1), Price Temperature (+66,2), NUPL (+63,3) und MVRV LTH (+61,0) setzen alle den Preis ins Verhältnis zum Einstand. Genau das tut die Familie „Bewertung" mit Gewicht 50 bereits.
- **Die Composites sind aus unseren eigenen Indikatoren gebaut.** Cycle Extreme (+66,6) besteht laut Anbieter aus MVRV-Z, Puell, Reserve Risk, Power Law und Rainbow. Sie messen die Ampel, nicht etwas Neues. Ausserdem wären sie eine Blackbox mit dauerhafter Abhängigkeit.
- **Artefakte erkennen.** Thermocap (100 zu 100), Ancient Supply (100 zu 96,9) und der LTH-Realized-Price (96,7 zu 99,4) sind stetig steigende Reihen, deren Perzentil immer oben klebt. Dass die Messung sie als nutzlos ausweist, spricht für die Messung.
- **Wirklich neu sind zwei:** SOPR LTH (+58,8) und Illiquid Supply (−46,6). Beide sprechen über Halterverhalten, also über die Familie, die ohne Abo fehlt. Beide gibt es nur bei BGeometrics. Damit beisst sich die Katze in den Schwanz.

Nichts davon rechtfertigt eine Änderung an `1.0`. Es sind Notizen für die Bewertung nach dem Zyklusende.

### Kerzenarchiv, unabhängig vom Abo

BGeometrics kennt keinen Endpunkt für 4-Stunden-Kerzen, und seine tägliche OHLC-Reihe beginnt erst am 31.12.2014. `scripts/local/fetch-kerzen.mjs` holt sie deshalb bei Bitstamp, also aus derselben Schnittstelle, aus der die Pipeline ihre Tagesschlüsse zieht. **Kein Abo, kein Schlüssel, jederzeit wiederholbar**, das Script schreibt fort statt neu zu holen.

| Datei in `data/private/` | Inhalt | Beginn |
|---|---|---|
| `kerzen_btcusd_4h.json` | O, H, L, C, Volumen | 18.08.2011, 33'032 Kerzen |
| `kerzen_btcusd_1d.json` | O, H, L, C, Volumen | 18.08.2011, 5'506 Kerzen |

Der 18. August 2011 ist die Wand: Davor gab es Bitstamp nicht. Für die Zeit von Juli 2010 bis dahin existieren nur Schlusskurse (BGeometrics-Preisreihe, Seed der Pipeline), keine belastbaren Kerzen; die einzige Quelle wäre Mt.Gox, und deren Archivdateien haben keine überprüfbare Herkunft. Andere Schritte holt `--step=3600` und so weiter, andere Paare `--paar=ethusd`.

**Das ist Archiv, kein Eingang.** Die Ampel prüft ausschliesslich Wochenschlüsse und benutzt auch für das Allzeithoch einen Tagesschluss (SPEC 2.3). High, Low und Volumen fliessen nirgends ein. Zudem verbietet die Ein-Quellen-Regel (SPEC 3.2), eine zweite Preisreihe in die bestehende zu mischen. Weil `data/private/` von `.gitignore` ausgeschlossen ist, überlebt das Archiv kein Zurückspielen des Repos: eine Kopie ausserhalb lohnt sich, es sind gut zwei Megabyte.

### Sauberkeit

Beide lokalen Scripts laufen nie im Runner. Rohdaten bleiben in `data/private/`. Veröffentlicht wird nur der Bericht, also Kennzahlen über die Daten. Was ausdrücklich **nicht** gemacht wurde: die abgezogene Historie in die öffentliche `data/manual.json` schreiben. Das wäre Weiterverbreitung der Rohdaten und ist auch mit dem Zusatzmodul „Commercial Publishing" nicht gedeckt. Verlockend wäre es gewesen, weil es die Perzentil-Untergrenze von 26 Wochen sofort erfüllt hätte.

## 11a. Frühwarnung: driften die Indikatoren?

`scripts/indikator-check.mjs` misst, ob die Indikatoren noch unterscheiden. Er braucht keine bezahlten Quellen, liest nur `data/weekly.json` und läuft deshalb im Runner. Der Workflow **Indikator-Prüfung** startet ihn am 2. Januar, kurz nach dem Jahres-Review, und legt ein Issue an, wenn etwas auffällt. Von Hand über *Actions* auslösbar.

**Ebene A, je Indikator.** Anteil der Wochen mit Score ≥ 70, gesamt und je Zyklus, gerechnet mit `scoreIndicators()`, also derselben Funktion wie im Live-Betrieb. Drei Urteile: **ruft dauernd** ab 60 % im laufenden Zyklus, **verstummt** bei höchstens 1 %, **driftet stark** ab 40 Punkten Unterschied zwischen den Zyklen. Der erste Fall ist der gefährlichste, weil er den Motor konstant anhebt, ohne noch etwas zu unterscheiden; genau so verhält sich Reserve Risk seit 2022, und ohne die Sonderprüfung vom September wäre es niemandem aufgefallen.

**Überblick je Motor.** Vor der Einzelliste steht der höchste je Zyklus erreichte Motorwert und der Anteil der Wochen in Zone, getrennt nach Kauf und Verkauf, dazu der Vergleich gegen die Schwelle von Weg E2. Das ist die Zahl, auf die es ankommt: nicht ob ein einzelner Indikator schwächelt, sondern ob der Motor als Ganzes seine Zone noch erreicht. Der Befund daraus steht in Abschnitt 5.

**Ebene B, das Grundmodell.** Schwächer, weil die Zyklusgrenzen aus eben diesem Modell stammen. Vier Prüfungen messen aber Grössen, die auch sonst gelten: wie lange kein Signal mehr kam (ein voller Zyklus sind 208 Wochen), ob der tiefste Rückgang je Zyklus noch unter der Torschwelle von −40 % bleibt, ob die Tiefs weiterhin 9 bis 16 Monate nach dem Hoch liegen, und ob viele Indikatoren gleichzeitig in dieselbe Richtung driften.

**Zwei Fehler beim Bauen, beide behoben und hier notiert.** Die Signalerkennung suchte nach Ereignissen vom Typ `BUY` oder `SELL`; sie heissen `TRANCHE_DUE`. Der Bericht behauptete dadurch „seit 844 Wochen kein Signal", richtig sind 190. Und die Aussage über fallende Höchstwerte prüfte nur den letzten gegen den ersten Zyklus und formulierte daraus eine Monotonie, die es nicht gibt (58 → 100 → 59 → 37 steigt zuerst). An ihrer Stelle steht jetzt die Rechnung gegen die E2-Schwelle, die ohnehin aussagekräftiger ist.

**Was er nicht kann, steht im Bericht selbst.** Er beweist nicht, dass der Zyklus zu Ende ist, und er warnt nicht rechtzeitig: Bei vier Zyklen ist ein abweichender fünfter statistisch bedeutungslos, erst der sechste wäre ein Muster. Sein Nutzen ist bescheidener und trotzdem real: Er verwandelt ein Unbehagen in datierte Zahlen.

---

## 12. Nächste Schritte

Das System ist betriebsbereit. Nichts davon ist dringend.

1. **Monatlich zwei Zahlen eintragen.** Angebot im Gewinn und STH-Realized-Price. Die Erinnerung kommt am Monatsanfang von selbst als Issue. Das Angebot im Gewinn allein hebt die Abdeckung des Kauf-Motors von 80 auf 100 %. Reserve Risk, RHODL und LTH-Positionsänderung bleiben leer, Begründung in Abschnitt 4a.
2. **Nach dem Zyklusende: Ankerpunkte von Reserve Risk neu schneiden.** Die vorhandene Historie liegt in `data/private/` und genügt dafür, ein zweites Abo ist nicht nötig. Ziel ist ein Anteil „in Zone" im einstelligen bis niedrigen zweistelligen Prozentbereich, wie ihn das Angebot im Gewinn mit 8,6 % im laufenden Zyklus erreicht.
3. **Bitcoin-Dominanz beschaffen und einmal messen.** Gratis und rückwirkend erhältlich, die Prüfvorschrift steht in Abschnitt 5a. Nur messen, nicht einbauen: Die Konfiguration bleibt eingefroren.
4. **Erste Indikator-Prüfung ansehen**, spätestens im Januar. Sie läuft von selbst; interessant ist, ob ausser Reserve Risk noch etwas driftet.
5. **M7, Härtung.** Barrierefreiheit, Grenzfälle der Oberfläche, Ladezeit. Der Grund für die Zurückstellung ist entfallen: Die Datenlage ist geklärt, die Abdeckung ändert sich nicht mehr überraschend. M7 ist damit der einzige noch offene Meilenstein und kann beginnen.
6. **Nach dem Zyklusende: Weg E2 und die Verkaufsseite neu denken.** Vier unabhängige Prüfungen zeigen auf dieselbe Stelle (Abschnitt 5). Die Kopplung `score_min × Abdeckung` ist entweder zu grob oder die Schwelle von 40 zu hoch. Erst dann entscheidet sich auch, ob RHODL und LTH-Positionsänderung dazukommen.
7. **Zweiter Abzug vor Ablauf des Zugangs**, etwa am 10. Oktober 2026: `node scripts/local/fetch-bgeometrics.mjs --probe --out=data/private-2` und danach derselbe Aufruf ohne `--probe`. Sichert die Reihen bis zum letzten Tag. Danach läuft der Zugang aus und wird nicht erneuert.

**Was ausdrücklich nicht getan werden sollte:** an `config/engine.json` drehen. Die Konfiguration `1.0` hat vier Backtest-Läufe, die Empfindlichkeitsprüfung und jetzt zusätzlich den BGeometrics-Nachlauf hinter sich. Sie bleibt bis zum Ende des laufenden Zyklus unverändert (SPEC 10.5). Das gilt ausdrücklich auch für die Versuchung, Weg E2 jetzt zu entkoppeln: Das Ergebnis von 2025 wäre damit auf genau einen Zyklus optimiert.
