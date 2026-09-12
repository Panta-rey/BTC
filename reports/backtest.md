# Backtest

Konfiguration `0.9-entwurf` · 662 Wochen ab 2014-01-05 bis 2026-09-06 · Gebühr 0.5 % pro Transaktion · Kernposition 40 %

> Ohne Steuern. Ausführung zum Wochenschluss der Signalwoche. Die BGeometrics-Kennzahlen fehlen (SPEC 3.4), der STH-Realized-Price war historisch nicht verfügbar, deshalb arbeitet der Trendfilter nur mit dem Bull Market Support Band.

## Ergebnis

| Strategie | BTC am Ende | Cash | Wert | Grösster Rückgang | Transaktionen |
|---|---|---|---|---|---|
| Halten | 1.0000 | – | 80'339 | – | 0 |
| Ampel | 2.6800 | 0 | 215'309 | -76.6 % | 12 |
| Sparplan | 52.6063 | 0 | 4'226'337 | – | 153 |
| Sparplan mit Faktor | 58.1526 | 0 | 4'671'917 | – | 153 |

Ampel gegen Halten: ✓ 2.6800 BTC statt 1,0000 BTC (plus 0 Cash).

## Abnahmekriterien (SPEC 10.3)

| Ereignis | Datum | Kurs | Phase-Eintritt | Abstand | Ø Preis | Verhältnis | Ziel | |
|---|---|---|---|---|---|---|---|---|
| Tief | 2015-01-14 | 172 | 2015-01-11 | 0 W | – | – | ≤ 1,6 × | ✗ |
| Tief | 2018-12-15 | 3'200 | 2018-12-02 | -2 W | 4'364 | 1.36 × | ≤ 1,6 × | ✓ |
| Tief | 2022-11-21 | 15'500 | 2022-06-26 | -21 W | 22'103 | 1.43 × | ≤ 1,6 × | ✓ |
| Hoch | 2013-12-04 | 1'150 | – | – | – | – | ≥ 0,6 × | ✗ |
| Hoch | 2017-12-17 | 19'800 | – | 13 W | 8'188 | 0.41 × | ≥ 0,6 × | ✗ |
| Hoch | 2021-11-10 | 69'000 | – | 5 W | 50'124 | 0.73 × | ≥ 0,6 × | ✓ |
| Hoch | 2025-10-06 | 126'000 | – | – | – | – | ≥ 0,6 × | ✗ |

## Phasen

| Von | Bis | Phase | Wochen | Kurs Anfang | Kurs Ende |
|---|---|---|---|---|---|
| 2014-01-05 | 2015-01-04 | 4 Abwärtstrend | 53 | 905 | 264 |
| 2015-01-11 | 2015-07-05 | 1 Akkumulation | 26 | 266 | 272 |
| 2015-07-12 | 2018-02-25 | 2 Aufwärtstrend | 138 | 311 | 9'590 |
| 2018-03-04 | 2018-03-11 | 3 Verteilung | 2 | 11'463 | 9'535 |
| 2018-03-18 | 2018-11-25 | 4 Abwärtstrend | 37 | 8'188 | 3'939 |
| 2018-12-02 | 2019-04-07 | 1 Akkumulation | 19 | 4'102 | 5'191 |
| 2019-04-14 | 2021-10-10 | 2 Aufwärtstrend | 131 | 5'163 | 54'715 |
| 2021-10-17 | 2021-12-05 | 3 Verteilung | 8 | 61'539 | 49'463 |
| 2021-12-12 | 2022-06-19 | 4 Abwärtstrend | 28 | 50'124 | 20'553 |
| 2022-06-26 | 2023-01-15 | 1 Akkumulation | 30 | 21'029 | 20'885 |
| 2023-01-22 | 2026-09-06 | 2 Aufwärtstrend | 190 | 22'717 | 80'339 |

## Transaktionen

| Woche | Tranche | Seite | Kurs | Betrag | BTC |
|---|---|---|---|---|---|
| 2018-03-18 | S1 | verkauf | 8'188 | 1'662 | 0.2040 |
| 2018-03-18 | S2 | verkauf | 8'188 | 1'613 | 0.1980 |
| 2018-03-18 | S3 | verkauf | 8'188 | 1'613 | 0.1980 |
| 2018-12-02 | B1 | kauf | 4'102 | 1'662 | 0.4031 |
| 2018-12-30 | B2 | kauf | 3'836 | 1'613 | 0.4185 |
| 2019-04-14 | B3 | kauf | 5'163 | 1'613 | 0.3109 |
| 2021-12-12 | S1 | verkauf | 50'124 | 15'592 | 0.3126 |
| 2021-12-12 | S2 | verkauf | 50'124 | 15'133 | 0.3034 |
| 2021-12-12 | S3 | verkauf | 50'124 | 15'133 | 0.3034 |
| 2022-06-26 | B1 | kauf | 21'029 | 15'592 | 0.7378 |
| 2022-07-24 | B2 | kauf | 22'596 | 15'133 | 0.6664 |
| 2023-01-22 | B3 | kauf | 22'717 | 15'133 | 0.6628 |

## Signale

| Typ | Anzahl |
|---|---|
| COUNTER | 13 |
| PHASE_CHANGE | 8 |
| TRANCHE_DUE | 9 |
| DATA_GAP | 1 |
| TREND_BREAK | 2 |
| RESERVE | 8 |

## Datenabdeckung

| Jahr | Ø Abdeckung Kauf | Ø Abdeckung Verkauf | Wochen mit Datenlücke |
|---|---|---|---|
| 2014 | 80.0 % | 65.0 % | 0 |
| 2015 | 80.0 % | 65.0 % | 24 |
| 2016 | 80.0 % | 65.0 % | 52 |
| 2017 | 80.0 % | 65.0 % | 53 |
| 2018 | 80.0 % | 78.0 % | 7 |
| 2019 | 80.0 % | 80.0 % | 0 |
| 2020 | 80.0 % | 80.0 % | 0 |
| 2021 | 80.0 % | 80.0 % | 0 |
| 2022 | 80.0 % | 80.0 % | 0 |
| 2023 | 80.0 % | 80.0 % | 0 |
| 2024 | 80.0 % | 80.0 % | 0 |
| 2025 | 80.0 % | 80.0 % | 0 |
| 2026 | 80.0 % | 80.0 % | 0 |

## Aktueller Stand

Phase 2 Aufwärtstrend seit 2023-01-22 · Kauf-Motor 42 · Verkauf-Motor 1 · Zähler 0 von 2
