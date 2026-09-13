# BGeometrics: Vergleich

Erstellt 2026-09-13 17:07 UTC · Konfiguration `1.0` · 843 Wochen · 68 abgezogene Reihen

> Dieser Bericht entstand lokal aus einem zeitlich begrenzten BGeometrics-Zugang. Er enthält Kennzahlen über die Daten, nicht die Daten selbst. Die Rohreihen liegen in `data/private/` und sind von `.gitignore` ausgeschlossen. Datenquelle der Vergleichsreihen: BGeometrics.

## 1. Wie gut rechnen wir selbst?

Mehrere Kennzahlen leiten wir aus freien Quellen ab, statt sie fertig zu beziehen. Hier der Abgleich mit den veröffentlichten Reihen über die gesamte gemeinsame Historie. **Dieses Ergebnis behält seinen Wert auch nach dem Ende des Zugangs**, weil es die freie Pipeline bestätigt oder widerlegt.

| Kennzahl | Wochen | Korrelation | Ø Abweichung | Ø relativ | grösste relativ | Urteil |
|---|---|---|---|---|---|---|
| Wochenschluss | 843 | 1.0000 | 47 USD | 0.6 % | 27.9 % | brauchbar |
| Realized Price | 843 | 1.0000 | 31 USD | 0.1 % | 2.0 % | tragfähig |
| MVRV-Z-Score | 791 | 1.0000 | 0.0027 σ | 0.5 % | 27.6 % | tragfähig |
| Puell Multiple | 791 | 0.9788 | 0.1197 × | 8.6 % | 50.9 % | brauchbar |
| Mayer Multiple | 797 | 0.9988 | 0.0087 × | 0.8 % | 55.2 % | tragfähig |
| 200-Wochen-Schnitt | 644 | 1.0000 | 33 USD | 0.4 % | 9.1 % | tragfähig |
| Pi-Cycle-Nähe | 767 | 0.9999 | 0.0006 × | 0.1 % | 3.2 % | tragfähig |
| Allzeithoch | 837 | 1.0000 | 80 USD | 0.6 % | 42.9 % | tragfähig |
| Abstand vom Hoch | 837 | 0.9943 | 0.6930 % | – | – | tragfähig |
| Fear & Greed (Woche) | 448 | 0.9587 | 4 Punkte | – | – | brauchbar |
| Wikipedia 4 Wochen | 581 | 0.9994 | 2'327 Aufrufe | 19.5 % | 33.8 % | brauchbar |
| Funding 30 Tage | 240 | 0.8457 | 0.0101 % / 8 h | 11340.7 % | 232209.1 % | prüfen |

- **Puell Multiple:** wir bewerten nur die Neuemission ohne Gebühren
- **Funding 30 Tage:** Einheit des Anbieters unbekannt, nur die Korrelation ist aussagekräftig

Eine Korrelation nahe 1 bei kleiner relativer Abweichung heisst: Unsere Ableitung trägt, und die freie Pipeline genügt auch ohne Abo. Ein Teil der verbleibenden Abweichung ist systembedingt und kein Fehler: Die Ampel rechnet durchgehend mit Wochenschlüssen und Tagesschlüssen (SPEC 2.3, HANDOFF §10).

## 2. Was hier geprüft wird, vorab festgehalten

Vier Zyklen sind eine dünne Grundlage. Wer vierzig zusätzliche Reihen gegen sie laufen lässt und nimmt, was am besten aussieht, hat nichts gelernt, sondern nur Rauschen angepasst. SPEC 10.5 verbietet das. Deshalb steht vor den Zahlen, was überhaupt als Ergebnis zählt:

| Frage | Wie beantwortet | Was ein Ergebnis wäre |
|---|---|---|
| Tragen unsere eigenen Ableitungen? | Abschnitt 1, Korrelation und relative Abweichung | Korrelation unter 0,95 bei einer Kennzahl, die in einen Motor eingeht |
| Ändern die fünf fehlenden das Ergebnis? | Abschnitt 3, drei vollständige Durchläufe | Unterschied beim Endvermögen über 3 % **oder** eine andere Zahl erfüllter Kriterien |
| Was kostet der fehlende STH-Einstand? | Abschnitt 3, Durchlauf „nur STH-Einstand" | verschobene Übergänge „Tief bestätigt" oder „Trendbruch" |
| Lohnen weitere Kennzahlen einen Blick? | Abschnitt 4, Trennschärfe an bekannten Wendepunkten | Trennschärfe über 40 Punkten bei einer Reihe, die keine Familie doppelt |

**Erwartung, vor dem Lauf notiert (HANDOFF §11):** Die fünf Kennzahlen verbessern das System nicht, sondern kosten das Verkaufssignal von 2025. Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2 von 32 auf 40, und 2025 hatte einen Score von 36. Trifft das zu, ist die Frage nach einem dauerhaften Abo beantwortet.

Was Abschnitt 4 ausdrücklich **nicht** tut: Schwellen suchen, Gewichte anpassen oder eine Reihe in einen Motor aufnehmen. Er misst nur, ob eine Reihe Tiefs und Hochs überhaupt unterscheidet. Alles Weitere wäre eine Entscheidung für den nächsten Zyklus, nicht für diese Konfiguration.

## 3. Verändern die fünf fehlenden Kennzahlen das Ergebnis?

Abgezogene Wochenwerte je Kennzahl: sth_rp 767 · supply_loss 843 · reserve_risk 836 · rhodl 775 · lth_dist 843

| Variante | Endvermögen | BTC | Cash | Transaktionen | Kriterien | grösster Rückgang |
|---|---|---|---|---|---|---|
| ohne Zusatzdaten (Stand heute) | 314'146 | 1.3277 | 207'481 | 15 | 4 von 7 | -76.6 % |
| nur STH-Einstand | 314'146 | 1.3277 | 207'481 | 15 | 4 von 7 | -76.6 % |
| mit allen fünf | 196'857 | 2.4503 | 0 | 12 | 3 von 7 | -76.6 % |

Das Endvermögen ist die vergleichbare Grösse, nicht der BTC-Bestand: Ein Durchlauf, der 2025 verkauft hat, hält Cash und weniger BTC (HANDOFF §5).

### Kriterien im Einzelnen

| Ereignis | ohne | nur STH | mit allen | Ziel |
|---|---|---|---|---|
| Tief 2015-01-14 | ✗ – | ✗ – | ✗ – | ≤ 1,6 × |
| Tief 2018-12-15 | ✓ 1.36 × | ✓ 1.36 × | ✓ 1.36 × | ≤ 1,6 × |
| Tief 2022-11-21 | ✓ 1.43 × | ✓ 1.43 × | ✓ 1.43 × | ≤ 1,6 × |
| Hoch 2013-12-04 | ✗ – | ✗ – | ✗ – | ≥ 0,6 × |
| Hoch 2017-12-17 | ✗ 0.55 × | ✗ 0.55 × | ✗ 0.37 × | ≥ 0,6 × |
| Hoch 2021-11-10 | ✓ 0.73 × | ✓ 0.73 × | ✓ 0.73 × | ≥ 0,6 × |
| Hoch 2025-10-06 | ✓ 0.83 × | ✓ 0.83 × | ✗ – | ≥ 0,6 × |

### Phasenwechsel im Vergleich

Der Trendfilter soll laut Spezifikation Trendband **und** STH-Einstand prüfen (SPEC 5.5). Historisch fehlte der zweite Teil, jeder bisherige Backtest rechnete nur mit dem Band. Hier zeigt sich zum ersten Mal, ob er die Übergänge verschiebt.

| # | ohne Zusatzdaten | mit allen fünf | Verschiebung |
|---|---|---|---|
| 1 | 2014-01-05 → Phase 4 | 2014-01-05 → Phase 4 | keine |
| 2 | 2015-01-11 → Phase 1 | 2014-12-28 → Phase 1 | -2 Wochen |
| 3 | 2015-07-12 → Phase 2 | 2015-07-12 → Phase 2 | keine |
| 4 | 2017-08-20 → Phase 3 | 2017-08-13 → Phase 3 | -1 Wochen |
| 5 | 2018-02-11 → Phase 4 | 2018-02-11 → Phase 4 | keine |
| 6 | 2018-12-02 → Phase 1 | 2018-12-02 → Phase 1 | keine |
| 7 | 2019-04-14 → Phase 2 | 2019-04-14 → Phase 2 | keine |
| 8 | 2021-10-10 → Phase 3 | 2021-10-24 → Phase 3 | 2 Wochen |
| 9 | 2021-12-12 → Phase 4 | 2021-12-12 → Phase 4 | keine |
| 10 | 2022-06-26 → Phase 1 | 2022-06-26 → Phase 1 | keine |
| 11 | 2023-01-22 → Phase 2 | 2023-01-22 → Phase 2 | keine |
| 12 | 2025-10-12 → Phase 3 | – | – |
| 13 | 2025-11-09 → Phase 4 | – | – |

### Aktueller Stand

| Variante | Phase | seit | Kauf-Motor | Verkauf-Motor | Abdeckung Kauf / Verkauf |
|---|---|---|---|---|---|
| ohne Zusatzdaten (Stand heute) | 4 Abwärtstrend | 2025-11-09 | 42 | 1 | 80 % / 80 % |
| mit allen fünf | 2 Aufwärtstrend | 2023-01-22 | 41 | 1 | 100 % / 100 % |

## 4. Trennen die übrigen Kandidaten Tiefs von Hochs?

Für jede zusätzlich abgezogene Reihe steht hier, in welchem Bereich ihrer eigenen Vier-Jahres-Historie sie an den bekannten Zyklustiefs und Zyklushochs lag (SPEC Anhang A, Fenster ± 8 Wochen, nur Vergangenheit sichtbar). Die Trennschärfe ist der Abstand. Ein stark positiver Wert heisst: Die Reihe ist an Hochs oben und an Tiefs unten, taugt also als Verkaufsanzeiger. Ein stark negativer Wert heisst dasselbe umgekehrt.

Das ist eine Beschreibung, keine Empfehlung. Eine hohe Trennschärfe allein rechtfertigt keine Aufnahme in einen Motor: Die meisten dieser Reihen messen dasselbe wie eine Kennzahl, die schon drin ist.

| Reihe | Gruppe | Wochen | Ø Perzentil an Tiefs | Ø Perzentil an Hochs | Trennschärfe |
|---|---|---|---|---|---|
| AVIV-Ratio | C | 842 | 12.4 | 80.0 | +67.7 |
| Realized Mayer Multiple | C | 797 | 11.4 | 78.5 | +67.1 |
| Cycle Extreme (Composite) | C | 827 | 10.7 | 77.3 | +66.6 |
| Price Temperature (Z gegen 4J-SMA) | C | 617 | 10.7 | 76.9 | +66.2 |
| NUPL | C | 843 | 12.0 | 75.3 | +63.3 |
| MVRV LTH | C | 815 | 9.3 | 70.3 | +61.0 |
| Regime Score (Composite) | C | 774 | 14.7 | 75.1 | +60.4 |
| Macro Risk Index (Composite) | C | 797 | 13.9 | 73.4 | +59.5 |
| Profitable Days | C | 829 | 41.0 | 100.0 | +59.0 |
| SOPR LTH | C | 843 | 10.7 | 69.5 | +58.8 |
| Power-Law-Oszillator | C | 836 | 34.1 | 81.7 | +47.7 |
| Illiquid Supply | C | 843 | 91.8 | 45.2 | -46.6 |
| SOPR | C | 843 | 17.7 | 61.5 | +43.8 |
| Hash Ribbons (30T / 60T) | ? | 767 | 25.0 | 67.6 | +42.6 |
| M2 Zentralbanken | D | 746 | 52.0 | 92.9 | +41.0 |
| MVRV STH | C | 714 | 24.5 | 59.5 | +35.0 |
| Supply Shock Ratio | C | 843 | 51.8 | 18.4 | -33.4 |
| Hashprice | C | 819 | 2.0 | 33.1 | +31.1 |
| Liveliness | C | 843 | 66.5 | 95.3 | +28.9 |
| VDD Multiple | C | 819 | 62.6 | 91.0 | +28.4 |
| True Market Mean | C | 838 | 71.5 | 99.6 | +28.2 |
| Halving-Fortschritt | C | 837 | 64.3 | 37.8 | -26.5 |
| Stablecoin Supply Ratio | C | 403 | 6.5 | 31.8 | +25.3 |
| M2 global | D | 746 | 73.8 | 98.9 | +25.1 |
| Stablecoin-Angebot | D | 458 | 74.9 | 99.9 | +25.0 |
| SOPR STH | C | 843 | 30.7 | 55.2 | +24.5 |
| STH Risk Index (Composite) | C | 714 | 29.6 | 53.6 | +24.0 |
| Exchange Reserve (BTC) | C | 753 | 88.1 | 64.7 | -23.4 |
| NVT-Z-Score | C | 843 | 64.5 | 42.2 | -22.3 |
| CDD 90dma | C | 838 | 61.0 | 80.9 | +19.9 |
| Miner Reserve (BTC) | C | 843 | 16.9 | 7.4 | -9.5 |
| Google Trends | C | 843 | 62.9 | 67.6 | +4.7 |
| Ancient Supply (10 J+) | C | 808 | 100.0 | 96.9 | -3.1 |
| Accumulation Trend Score | C | 843 | 31.6 | 28.6 | -3.0 |
| LTH-Realized-Price | A | 767 | 96.7 | 99.4 | +2.7 |
| Miner Net Flow (BTC) | C | 843 | 45.0 | 42.3 | -2.7 |
| Exchange Netflow (BTC) | C | 753 | 53.6 | 52.1 | -1.4 |
| Thermocap-Ratio | C | 843 | 100.0 | 100.0 | +0.0 |

Über 40 Punkten Trennschärfe: AVIV-Ratio, Realized Mayer Multiple, Cycle Extreme (Composite), Price Temperature (Z gegen 4J-SMA), NUPL, MVRV LTH, Regime Score (Composite), Macro Risk Index (Composite), Profitable Days, SOPR LTH, Power-Law-Oszillator, Illiquid Supply, SOPR, Hash Ribbons (30T / 60T), M2 Zentralbanken. Das ist ein Hinweis für die Bewertung nach dem Ende des laufenden Zyklus, keine Änderung an `1.0`.

## Schlussfolgerung

Die Zusatzdaten kosten ein Kriterium (3 statt 4). Das ist genau die in Abschnitt 2 notierte Erwartung: Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2, und das knappe Signal von 2025 fällt darunter. **Ein dauerhaftes Abo verbessert das System nach diesen Zahlen nicht.**

Der STH-Einstand allein verschiebt keinen Übergang. Der vereinfachte Trendfilter, der nur das Bull Market Support Band prüft, kam historisch also zum selben Ergebnis.

Wichtig: Vier Zyklen sind eine dünne Grundlage. Ein Unterschied von wenigen Prozent ist Rauschen, kein Beleg.

