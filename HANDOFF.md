# Handoff

Kurzer Zustandsbericht des Projekts. Wer hier einsteigt, liest zuerst dieses Dokument, dann `SPEC.md`.

**Stand:** 12. September 2026 · Konfiguration `1.0-rc` · Node 22, keine Abhängigkeiten · **40 Tests grün**

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
| M3 | Oberfläche: Ampel, Phasenleiste, Motoren, Checkliste, Kacheln, Verlauf | ✅ `index.html` |
| M4 | Position und Journal im Browser (`localStorage`) | ✅ in `index.html` |
| M5 | Benachrichtigungen (GitHub Issues, optional ntfy) | ⬜ |
| M6 | Verlauf und Zyklus-Uhr als Grafik | ✅ als eigenes SVG, ohne Bibliothek |
| M7 | Härtung, Barrierefreiheit | ⬜ |

**40 Tests, alle grün** (`node --test "test/**/*.test.mjs"`).

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
| Mindestabdeckung | 70 % | 60 % | Ohne Fear & Greed (ab Feb. 2018) und Funding (ab 2019) erreicht der Verkaufs-Motor nur 65 %. Mit 70 % war er bis 2018 dauerhaft blind und verpasste das Hoch 2017. |
| Konvergenz-Zählung | alle Familien mit einem Indikator in Zone | nur Familien, die auch in den Score eingehen | Sonst war die Konvergenzbedingung leichter zu erfüllen als der Score. |
| Schwelle von Weg E2 | fest 40 | 40 × Abdeckung | Mit einer dauerhaft fehlenden Familie sind 20 Gewichtspunkte unerreichbar. Deshalb wurde das Hoch 2025 um vier Punkte verfehlt. |

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

### Lauf 4 (echte Daten, E2-Schwelle an Abdeckung gekoppelt) — Kalibrierung abgeschlossen

| Strategie | BTC am Ende | Wert | Transaktionen |
|---|---|---|---|
| Halten | 1,0000 | 80'339 | 0 |
| **Ampel** | **3,32** (Lauf 3) | | 12 |

| Extrem | Phase-Eintritt | Abstand | Ø Preis | Verhältnis | Ziel | |
|---|---|---|---|---|---|---|
| Tief 2015 | 2015-01-11 | 0 W | – | – | ≤ 1,6 × | Zeitpunkt exakt, kein Cash vorhanden |
| Tief 2018 | 2018-12-02 | −2 W | 4'364 | 1,36 × | ≤ 1,6 × | ✓ |
| Tief 2022 | 2022-06-26 | −21 W | 22'103 | 1,43 × | ≤ 1,6 × | ✓ |
| Hoch 2017 | – | −9 W | 10'831 | 0,55 × | ≥ 0,6 × | ✗ Parabel, nur 65 % Abdeckung |
| Hoch 2021 | – | +5 W | 50'124 | 0,73 × | ≥ 0,6 × | ✓ |
| Hoch 2025 | – | +5 W | 104'705 | **0,83 ×** | ≥ 0,6 × | ✓ bestes Ergebnis |

Phasenverlauf des letzten Zyklus: Verteilung ab 2025-10-12 (eine Woche nach dem Hoch), Trendbruch 2025-11-09 bei 104'705.

**Aktueller Stand: Phase 4 Abwärtstrend seit 2025-11-09.** Kauf-Motor 42, Verkauf-Motor 1. Das Juni-Tief 2026 bei rund 60'000 hat Phase 1 nicht ausgelöst: Gate A scheiterte (der Realized Price wurde nie unterschritten), Gate B vermutlich am MVRV-Perzentil. Ob das richtig war, zeigt erst der weitere Verlauf.

**Bewertung:** Fünf von sieben Kriterien erfüllt. Die beiden Ausnahmen sind erklärt und dokumentiert: 2015 fehlte das Startkapital, 2017 war eine Parabel bei halber Datenlage. SPEC 10.5 verbietet ausdrücklich, für einen einzelnen Zyklus nachzujustieren. Konfiguration steht auf `1.0-rc`.

**Noch offen vor dem Einfrieren auf 1.0:** die Empfindlichkeitsprüfung (`node scripts/backtest.mjs --sensitivity` oder im Workflow das Häkchen setzen). Kriterium aus SPEC 10.3: Wird eine einzelne Schwelle um ±15 % verschoben, darf höchstens einer von drei Zyklen durchfallen.

### Lauf 3 (echte Daten, Abdeckungsschwelle 60 %, Konvergenz korrigiert)

| Strategie | BTC am Ende | Wert | Transaktionen |
|---|---|---|---|
| Halten | 1,0000 | 80'339 | 0 |
| **Ampel** | **3,3192** | **266'663** | 12 |
| Sparplan | 52,61 | 4'226'337 | 153 |
| Sparplan mit Faktor | 57,79 | 4'645'093 | 153 |

| Extrem | nächste Woche | Score | Abdeckung | Gates | Ergebnis |
|---|---|---|---|---|---|
| Tief 2015 | 2015-01-11 | 79 | 80 % | A ✓ | Phaseneintritt exakt am Tief |
| Tief 2018 | 2018-12-16 | 95 | 80 % | A ✓ B ✓ | 1,36 × ✓ |
| Tief 2022 | 2022-11-20 | 87 | 80 % | A ✓ B ✓ | 1,43 × ✓ |
| Hoch 2013 | 2014-01-05 | 58 | 65 % | – | ausserhalb des Datenbereichs |
| Hoch 2017 | 2017-12-17 | 100 | 65 % | E1 ✓ E2 ✓ | 0,55 ×, knapp unter dem Ziel |
| Hoch 2021 | 2021-11-07 | 51 | 80 % | E2 ✓ | 0,73 × ✓ |
| Hoch 2025 | 2025-10-05 | 36 | 80 % | keines | **verpasst** |

Die Senkung der Abdeckungsschwelle hat gewirkt: 2017 erreichte in der Hochwoche einen Score von 100, und die Datenlücken vor 2018 sind verschwunden. Der Ertrag stieg von 2,68 auf 3,32 BTC.

**Ursache für 2025 gefunden.** Der Score lag bei 36, gefordert waren 40. Die Aufschlüsselung: Zeit & Trend 63 (die Zyklus-Uhr stand mit 533 Tagen perfekt), relative Bewertung 16, Euphorie 0. Das bildet die Realität korrekt ab, 2025 hatte weder Euphorie noch Retail-Aufmerksamkeit noch hohes Funding.

Der Fehler lag in der Schwelle selbst. Die 40 wurden für vier Familien gesetzt. Da „Halterverhalten" wegen BGeometrics fehlt, sind 20 Gewichtspunkte gar nicht erreichbar, der Motor kann strukturell nur 80 % liefern. **Behebung: Die Schwelle von E2 wird an die Abdeckung gekoppelt**, also 40 × 0,80 = 32. Kommt BGeometrics zurück, steigt sie von selbst auf 40. Weg E1 bleibt ungekoppelt, damit der Pfad der Überhitzung in einer Parabel nicht zu früh öffnet.

Geprüft: 2021 (Score 51) und 2017 (Score 100) lagen ohnehin darüber, die Änderung betrifft nur 2025.

**Was 2025 mit der Änderung passieren müsste:** Phase 3 ab etwa August 2025, dann keine S-Tranchen (Score bleibt unter 70), sondern Verkauf beim Trendbruch. Genau so lief 2021, mit 0,73 × als Ergebnis. Wichtig: Danach folgt Phase 4, und das Juni-Tief 2026 bei rund 60'000 könnte Phase 1 auslösen. **Das würde die heutige Empfehlung von „halten" auf „akkumulieren" ändern.** Der nächste Lauf zeigt es.

**2017 bleibt bei 0,55 × und wird so hingenommen.** Phase 3 begann im August 2017 bei 4'059 über Weg E1, S1 verkaufte im Oktober bei 5'680. Das Hoch lag im Dezember bei 19'800, wobei sich der Kurs in den letzten sechs Wochen verdreifachte. Gegen eine solche Parabel hilft keine Schwellenverschiebung, die nicht gleichzeitig 2021 und 2025 verschlechtert. Dazu kam die Abdeckung von nur 65 %. SPEC 10.5 warnt ausdrücklich davor, für einen einzelnen Zyklus zu optimieren.

**Diagnose Lauf 2 (Kaufseite, echte Daten):** Alle drei Tiefs sauber erkannt, keine einzige Datenlücke im Fenster von ±26 Wochen.

| Tief | nächste Woche | Kauf-Score | Gates | Familien (Bewertung / Miner / Zeit) |
|---|---|---|---|---|
| 2015-01-14 | 2015-01-11 | 79 | A ✓ | 84 / 42 / 100 |
| 2018-12-15 | 2018-12-16 | 95 | A ✓ B ✓ | 97 / 80 / 100 |
| 2022-11-21 | 2022-11-20 | 87 | A ✓ B ✓ | 97 / 41 / 100 |

**Dabei ist ein Zählfehler aufgefallen und behoben.** Die Diagnose meldete für 2018 „8 Indikatoren in Zone aus 4 Familien (3 verfügbar)". Vier von drei ist unmöglich. Die Konvergenz zählte auch Familien mit, die mangels Mitgliedern gar nicht in den Score eingehen, hier „Halter & Stimmung" mit nur noch Fear & Greed. Damit war die Konvergenzbedingung leichter zu erfüllen als der Score selbst. Jetzt zählen nur wertende Familien, ein Test sichert das ab.

**Achtung, das verschärft die Kaufbedingung.** Verfügbar sind drei Familien, gefordert sind damit drei, also muss auch die Miner-Familie einen Indikator in Zone haben. In der Tabelle oben liegt sie 2015 bei 42 und 2022 bei 41. Der Phaseneintritt 2022 erfolgte allerdings schon im Juni, als die Miner-Kapitulation lief (stärkste Woche September: 93). Ob die Eintritte halten, zeigt der nächste Lauf. Falls ein Tief kippt, gibt es zwei Hebel, in dieser Reihenfolge zu prüfen:

1. Die Ankerpunkte von `puell` und `hash_ribbons` grosszügiger setzen, weil beide an Tiefs oft nur mittlere Werte zeigen.
2. Die Konvergenz nicht über die Zahl der Familien definieren, sondern über das Gewicht: „Indikatoren in Zone müssen zusammen mindestens X Prozent des verfügbaren Gewichts stellen." Das ist sauberer, aber ein grösserer Eingriff.

**Vorgehen für Lauf 4:** `node scripts/backtest.mjs --sensitivity`, dann den Diagnose-Abschnitt für „Hoch 2025-10-06" lesen. Die Zusammenfassung im Actions-Lauf zeigt jetzt den ganzen Bericht, und die Diagnose beginnt mit einer Übersichtstabelle aller sieben Extreme. Erst danach Parameter ändern, und nur solche, die in allen Zyklen helfen. Am Ende `config/engine.json` auf `version: "1.0"` setzen.

**Offene Nebenfrage:** ob das Juni-Tief 2026 bei rund 60'000 über Gate B ausgelöst hätte. Der Phasen-Abschnitt zeigt bisher durchgehend Phase 2 seit Januar 2023, also nein. Auch das klärt die Diagnose.

### 6.2 Die Oberfläche (fertig)

`index.html` ist eine einzelne Datei ohne Abhängigkeiten, in der Gestaltung des Cockpits, mit einer senkrechten Ampel als einzigem lautem Element. Aufbau von oben nach unten: Ampel mit Handlungssatz und Betrag, Phasenleiste, beide Motoren, Checkliste „bis zum nächsten Schritt", Zyklus-Uhr, Position, Indikator-Kacheln nach Familien, Verlauf, Journal.

Der Verlauf ist ein selbst gezeichnetes SVG aus `data/phases.json`, logarithmisch, mit den Phasen als Hintergrundbänder und Dreiecken für die Tranchen. Keine Chart-Bibliothek.

Position, erledigte Tranchen und Journal liegen ausschliesslich im Browser (`localStorage`, Präfix `zy_`), mit Export und Import. Sie gehen nie ins Repo.

**Testzustände:** `index.html?fixture=kauf-tranche`, `?fixture=verkauf`, `?fixture=datenluecke` laden Dateien aus `data/fixtures/` statt `data/latest.json`. Damit lässt sich jeder Zustand prüfen, ohne auf den Markt zu warten.

**Noch offen an der Oberfläche:** Antippen des Verlaufs für Details zu einer Woche, und die Anzeige von Systemsignalen aus `events.json` im Journal.

### 6.3 M5, Benachrichtigungen

`notify.mjs` fehlt noch. Vorgesehen sind GitHub Issues als Standardkanal (E-Mail und Push über die GitHub-App) und optional ntfy. Die Ereignisse liegen bereits vollständig in `data/events.json`, jedes mit eindeutiger ID und dem Feld `notified_at`, das über Läufe hinweg erhalten bleibt. Einzelheiten in SPEC 9.

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
