# Handoff

Zustandsbericht des Projekts. Wer hier einsteigt, liest zuerst dieses Dokument, dann `SPEC.md`.

**Stand:** 12. September 2026 · Konfiguration `1.0` (eingefroren) · Node 22, keine Abhängigkeiten · 52 Tests grün
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
| M2b | Manuelle Werte aus Checkonchain, Herkunftsanzeige | ✅ |
| M3 | Oberfläche: Ampel, Phasenleiste, Motoren, Checkliste, Kacheln | ✅ `index.html` |
| M4 | Position und Journal im Browser | ✅ in `index.html` |
| M6 | Verlauf und Zyklus-Uhr als Grafik | ✅ eigenes SVG, ohne Bibliothek |
| M5 | Benachrichtigungen (GitHub Issues, optional ntfy) | ✅ `scripts/notify.mjs` |
| M7 | Härtung, Barrierefreiheit, Grenzfälle | ⬜ **nächster Schritt** |

**Aktueller Marktstand laut Ampel:** Phase 4 Abwärtstrend seit 9. November 2025. Kauf-Motor 42, Verkaufs-Motor 1, Ampel gelb, „Bereit machen. Die Kaufzone rückt näher, noch nicht kaufen." Es fehlen 18 Punkte zur Kaufzone, kein Tor ist offen, 2 von 4 Indikatoren in Zone aus 2 von 3 Familien.

---

## 3. Aufbau

```
index.html             die Seite, eine Datei, ohne Abhängigkeiten
scripts/fetch.mjs      Quellen  → data/raw/          (Netzwerk, fehlertolerant)
scripts/build.mjs      data/raw → data/*.json        (Wochenauswertung + Wiedergabe)
scripts/backtest.mjs   weekly   → reports/backtest.md
scripts/notify.mjs     Benachrichtigungen (Issues, optional ntfy)
scripts/lib/sim.mjs        Simulation und Bewertung, von Backtest und Vergleich genutzt
scripts/local/             läuft NUR lokal, nie im Runner
  fetch-bgeometrics.mjs  einmaliger Datenabzug → data/private/ (gitignored)
  compare.mjs            Vergleich → reports/bgeometrics-vergleich.md
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

Die Gratis-Stufe von BGeometrics verbietet genau unseren Aufbau: Abrufe von fremden Systemen (GitHub-Runner) und die Anzeige auf einer öffentlichen Seite gelten als kommerzielle Weiterverbreitung. **Eine Anfrage an info@bgeometrics.com läuft.** Der Token liegt als Secret `BGEOMETRICS_TOKEN` bereit und wird nicht benutzt.

### Manuelle Werte aus Checkonchain (Zwischenlösung)

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

**Bei einer Zusage:** Die fünf Kennzahlen kommen über `fetch.mjs` dazu, die Familien werden vollständig, die Konvergenzanforderung steigt automatisch zurück auf drei Familien, und die Schwelle von Weg E2 steigt von 32 auf 40. Danach muss der Backtest neu bewertet werden, weil sich beide Motoren ändern.

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

**Konfiguration `1.0` ist eingefroren** und wird erst nach dem Ende des laufenden Zyklus neu bewertet (SPEC 10.5). Eine Ausnahme: Kommen die BGeometrics-Kennzahlen dazu, ändern sich Abdeckung und die gekoppelte E2-Schwelle, dann muss der Backtest neu bewertet werden.

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

Der Verlauf liest zusätzlich `events.json` und zeichnet **alle** Transaktionen der Historie ein, nicht nur die des laufenden Zyklus.

**Noch offen:** Antippen des Verlaufs für Details zu einer Woche, Systemsignale aus `events.json` im Journal, Prüfung der Barrierefreiheit (M7).

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

---

## 8. Fallstricke

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

## 9. Warum Nachrechnen andere Zahlen ergibt

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

---

## 10. Offene Frage: lohnt sich BGeometrics?

Das Add-on „Commercial Publishing" kostet 20 Dollar im Monat, der Tarif Advanced 18. Für ein privates Projekt ist das viel, und ein dauerhaftes Abo wurde deshalb verworfen. Offen bleibt aber, ob die fünf Kennzahlen das System überhaupt besser machen. Diese Frage lässt sich mit **einem Monat Advanced, rein zur Auswertung**, ein für alle Mal klären.

**Welcher Tarif.** Advanced für 18 Dollar genügt weit: Ein Vollabzug braucht 20 bis 40 Anfragen, Advanced erlaubt 200 pro Stunde und 300 pro Tag, dazu zwei IPs. Premium und Premium+ bringen nur mehr Durchsatz und die Block-API, die wir nicht brauchen.

**Vorher klären.** Bei der Gratis-Stufe steht „Historical data limited to the last 4 years". Bei den bezahlten Stufen taucht die Historie in der Vergleichsansicht gar nicht auf, dort stehen nur Durchsatz, Alerts und IPs. Ob Advanced die volle Historie enthält, entscheidet über den ganzen Zweck. Eine kurze Rückfrage an info@bgeometrics.com genügt.

**Was die Werkzeuge tun.**

`scripts/local/fetch-bgeometrics.mjs` zieht zehn Reihen: die fünf fehlenden Kennzahlen, vier zur Gegenprobe unserer eigenen Ableitungen (Realized Price, MVRV-Z, Puell, Hash Ribbons) und Funding mit längerer Historie. Es pausiert 20 Sekunden zwischen den Abrufen und schreibt nach `data/private/`, das von `.gitignore` ausgeschlossen ist.

`scripts/local/compare.mjs` beantwortet daraus zwei Fragen und schreibt `reports/bgeometrics-vergleich.md`:

1. **Wie gut rechnen wir selbst?** Korrelation und relative Abweichung unserer aus Coin Metrics abgeleiteten Reihen gegen die veröffentlichten. Beim Puell wissen wir, dass wir nur die Neuemission ohne Gebühren bewerten; Hash Ribbons ist ganz selbstgebaut. **Dieser Nutzen bleibt auch nach der Kündigung**, weil er die freie Pipeline bestätigt, statt sie zu ersetzen.
2. **Verändern die Zusatzdaten das Ergebnis?** Drei Durchläufe im Vergleich: ohne Zusatzdaten, nur mit dem STH-Einstand, und mit allen fünf. Dazu die Phasenwechsel nebeneinander.

**Der STH-Einstand ist dabei der wertvollste Posten**, wertvoller als die fünf fehlenden Kennzahlen. Der Trendfilter soll laut Spezifikation Trendband **und** STH-Einstand prüfen. Historisch war der zweite Teil nie verfügbar, deshalb hat jeder bisherige Backtest nur mit dem Band gerechnet. Die Übergänge „Tief bestätigt" und „Trendbruch" sind in ihrer eigentlich gedachten Form also nie geprüft worden.

**Erwartung.** Meine Vermutung ist, dass die fünf Kennzahlen das System nicht verbessern, sondern das Signal von 2025 kosten: Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2 von 32 auf 40, und 2025 hatte einen Score von 36. Falls das eintritt, ist die Frage für 18 Dollar dauerhaft erledigt.

**Sauberkeit.** Beide Scripts laufen nur lokal, nie im Runner. Rohdaten bleiben in `data/private/`. Veröffentlicht wird nur der Bericht, also Kennzahlen über die Daten, nicht die Daten. Das ist während eines laufenden Zugangs gedeckt und bleibt es auch danach.

---

## 11. Nächste Schritte

1. **Benachrichtigungen prüfen.** Unter Actions → Wochenlauf → „Run workflow" das Häkchen bei „Zusätzlich eine Testmeldung verschicken" setzen. Es entsteht ein Issue mit dem Label `signal`, das als E-Mail und über die GitHub-App als Push ankommt. Optional ein Secret `NTFY_TOPIC` mit einem zufälligen Namen für Push ohne GitHub-App.
2. **M7, Härtung.** Barrierefreiheit prüfen, Grenzfälle der Oberfläche, Ladezeit. Sinnvoll erst, wenn die Datenlage geklärt ist: Kommen die fehlenden Kennzahlen dazu, ändern sich Abdeckung, Konvergenz und Schwellen, und dieselben Grenzfälle wären erneut zu prüfen.
3. **Reserve Risk, STH-Realized-Price und Angebot im Gewinn** monatlich über den Speichern-Knopf nachtragen, solange BGeometrics offen ist. Alle drei wirken sofort; schon eine davon hebt die Abdeckung des Kauf-Motors auf 100 %. Reserve Risk ist die einfachste, weil ein Blick auf die BGeometrics-Chartseite genügt.
4. **Nach der Antwort von BGeometrics** die fünf Kennzahlen anbinden und den Backtest neu bewerten. Solange warten, bevor an der Konfiguration etwas geändert wird.
