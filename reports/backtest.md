# Backtest

Konfiguration `0.9-entwurf` · 662 Wochen ab 2014-01-05 bis 2026-09-06 · Gebühr 0.5 % pro Transaktion · Kernposition 40 %

> Startkapital: 1 BTC, kein Cash. Kauftranchen vor dem ersten Verkauf sind deshalb nicht finanzierbar – das betrifft das Tief 2015. Für Tiefs zählt daher vor allem der Zeitpunkt des Phaseneintritts.

> Ohne Steuern. Ausführung zum Wochenschluss der Signalwoche. Die BGeometrics-Kennzahlen fehlen (SPEC 3.4), der STH-Realized-Price war historisch nicht verfügbar, deshalb arbeitet der Trendfilter nur mit dem Bull Market Support Band.

## Ergebnis

| Strategie | BTC am Ende | Cash | Wert | Grösster Rückgang | Transaktionen |
|---|---|---|---|---|---|
| Halten | 1.0000 | – | 80'339 | – | 0 |
| Ampel | 3.3192 | 0 | 266'663 | -76.6 % | 12 |
| Sparplan | 52.6063 | 0 | 4'226'337 | – | 153 |
| Sparplan mit Faktor | 57.7938 | 2'000 | 4'645'093 | – | 153 |

Ampel gegen Halten: ✓ 3.3192 BTC statt 1,0000 BTC (plus 0 Cash).

## Abnahmekriterien (SPEC 10.3)

| Ereignis | Datum | Kurs | Phase-Eintritt | Abstand | Ø Preis | Verhältnis | Ziel | |
|---|---|---|---|---|---|---|---|---|
| Tief | 2015-01-14 | 172 | 2015-01-11 | 0 W | – | – | ≤ 1,6 × | ✗ |
| Tief | 2018-12-15 | 3'200 | 2018-12-02 | -2 W | 4'364 | 1.36 × | ≤ 1,6 × | ✓ |
| Tief | 2022-11-21 | 15'500 | 2022-06-26 | -21 W | 22'103 | 1.43 × | ≤ 1,6 × | ✓ |
| Hoch | 2013-12-04 | 1'150 | – | – | – | – | ≥ 0,6 × | ✗ |
| Hoch | 2017-12-17 | 19'800 | – | -9 W | 10'831 | 0.55 × | ≥ 0,6 × | ✗ |
| Hoch | 2021-11-10 | 69'000 | – | 5 W | 50'124 | 0.73 × | ≥ 0,6 × | ✓ |
| Hoch | 2025-10-06 | 126'000 | – | – | – | – | ≥ 0,6 × | ✗ |

## Diagnose an den bekannten Extremen

| Extrem | Datum | nächste Woche | Score | Abdeckung | Gates | stärkste Woche | Score |
|---|---|---|---|---|---|---|---|
| Tief | 2015-01-14 | 2015-01-11 | 79 | 80.0 % | A=✓ B=✗ | 2015-02-08 | 94 |
| Tief | 2018-12-15 | 2018-12-16 | 95 | 80.0 % | A=✓ B=✓ | 2019-01-13 | 96 |
| Tief | 2022-11-21 | 2022-11-20 | 87 | 80.0 % | A=✓ B=✓ | 2022-09-25 | 96 |
| Hoch | 2013-12-04 | 2014-01-05 | 58 | 65.0 % | E1=✗ E2=✗ | 2014-01-05 | 58 |
| Hoch | 2017-12-17 | 2017-12-17 | 100 | 65.0 % | E1=✓ E2=✓ | 2017-12-17 | 100 |
| Hoch | 2021-11-10 | 2021-11-07 | 51 | 80.0 % | E1=✗ E2=✓ | 2021-11-14 | 52 |
| Hoch | 2025-10-06 | 2025-10-05 | 36 | 80.0 % | E1=✗ E2=✗ | 2025-10-05 | 36 |

Für jedes Extrem: die nächstgelegene Woche und die stärkste Woche im Fenster von ±26 Wochen. `cov` ist die Abdeckung des jeweiligen Motors, `gaps` die Zahl der Wochen mit Datenlücke im Fenster.

### Tief 2015-01-14 (172 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2015-01-11 | 79 | 80.0 % | 1 | A=✓ B=✗ | {"bewertung":84,"halter_stimmung":null,"miner":42,"zeit":100} |
| stärkste | 2015-02-08 | 94 | 80.0 % | | A=✓ B=✗ | {"bewertung":91,"halter_stimmung":null,"miner":100,"zeit":100} |

Konvergenz in der nächstgelegenen Woche: 6 Indikatoren in Zone aus 3 Familien (3 verfügbar). Zyklus-Uhr: – Tage. Wochen mit Datenlücke im Fenster: 0 von 52.

### Tief 2018-12-15 (3'200 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2018-12-16 | 95 | 80.0 % | 1 | A=✓ B=✓ | {"bewertung":97,"halter_stimmung":null,"miner":80,"zeit":100} |
| stärkste | 2019-01-13 | 96 | 80.0 % | | A=✓ B=✗ | {"bewertung":94,"halter_stimmung":null,"miner":97,"zeit":100} |

Konvergenz in der nächstgelegenen Woche: 7 Indikatoren in Zone aus 3 Familien (3 verfügbar). Zyklus-Uhr: – Tage. Wochen mit Datenlücke im Fenster: 0 von 52.

### Tief 2022-11-21 (15'500 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2022-11-20 | 87 | 80.0 % | 1 | A=✓ B=✓ | {"bewertung":97,"halter_stimmung":null,"miner":41,"zeit":100} |
| stärkste | 2022-09-25 | 96 | 80.0 % | | A=✓ B=✓ | {"bewertung":98,"halter_stimmung":null,"miner":93,"zeit":94} |

Konvergenz in der nächstgelegenen Woche: 7 Indikatoren in Zone aus 3 Familien (3 verfügbar). Zyklus-Uhr: – Tage. Wochen mit Datenlücke im Fenster: 0 von 52.

### Hoch 2013-12-04 (1'150 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2014-01-05 | 58 | 65.0 % | 4 | E1=✗ E2=✗ | {"zeit_trend":38,"rel_bewertung":92,"halter":null,"euphorie":null} |
| stärkste | 2014-01-05 | 58 | 65.0 % | | E1=✗ E2=✗ | {"zeit_trend":38,"rel_bewertung":92,"halter":null,"euphorie":null} |

Konvergenz in der nächstgelegenen Woche: 4 Indikatoren in Zone aus 2 Familien (2 verfügbar). Zyklus-Uhr: – Tage. Wochen mit Datenlücke im Fenster: 0 von 22.

### Hoch 2017-12-17 (19'800 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2017-12-17 | 100 | 65.0 % | 3 | E1=✓ E2=✓ | {"zeit_trend":100,"rel_bewertung":100,"halter":null,"euphorie":null} |
| stärkste | 2017-12-17 | 100 | 65.0 % | | E1=✓ E2=✓ | {"zeit_trend":100,"rel_bewertung":100,"halter":null,"euphorie":null} |

Konvergenz in der nächstgelegenen Woche: 5 Indikatoren in Zone aus 2 Familien (2 verfügbar). Zyklus-Uhr: 526 Tage. Wochen mit Datenlücke im Fenster: 0 von 53.

### Hoch 2021-11-10 (69'000 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2021-11-07 | 51 | 80.0 % | 3 | E1=✗ E2=✓ | {"zeit_trend":75,"rel_bewertung":22,"halter":null,"euphorie":38} |
| stärkste | 2021-11-14 | 52 | 80.0 % | | E1=✗ E2=✓ | {"zeit_trend":75,"rel_bewertung":23,"halter":null,"euphorie":40} |

Konvergenz in der nächstgelegenen Woche: 1 Indikatoren in Zone aus 1 Familien (3 verfügbar). Zyklus-Uhr: 545 Tage. Wochen mit Datenlücke im Fenster: 0 von 52.

### Hoch 2025-10-06 (126'000 USD)

| | Woche | Score | Abdeckung | Phase | Gates | Familien |
|---|---|---|---|---|---|---|
| nächstgelegen | 2025-10-05 | 36 | 80.0 % | 2 | E1=✗ E2=✗ | {"zeit_trend":63,"rel_bewertung":16,"halter":null,"euphorie":0} |
| stärkste | 2025-10-05 | 36 | 80.0 % | | E1=✗ E2=✗ | {"zeit_trend":63,"rel_bewertung":16,"halter":null,"euphorie":0} |

Konvergenz in der nächstgelegenen Woche: 1 Indikatoren in Zone aus 1 Familien (3 verfügbar). Zyklus-Uhr: 533 Tage. Wochen mit Datenlücke im Fenster: 0 von 52.

## Phasen

| Von | Bis | Phase | Wochen | Kurs Anfang | Kurs Ende |
|---|---|---|---|---|---|
| 2014-01-05 | 2015-01-04 | 4 Abwärtstrend | 53 | 905 | 264 |
| 2015-01-11 | 2015-07-05 | 1 Akkumulation | 26 | 266 | 272 |
| 2015-07-12 | 2017-08-13 | 2 Aufwärtstrend | 110 | 311 | 4'054 |
| 2017-08-20 | 2018-02-04 | 3 Verteilung | 25 | 4'059 | 8'191 |
| 2018-02-11 | 2018-11-25 | 4 Abwärtstrend | 42 | 8'067 | 3'939 |
| 2018-12-02 | 2019-04-07 | 1 Akkumulation | 19 | 4'102 | 5'191 |
| 2019-04-14 | 2021-10-10 | 2 Aufwärtstrend | 131 | 5'163 | 54'715 |
| 2021-10-17 | 2021-12-05 | 3 Verteilung | 8 | 61'539 | 49'463 |
| 2021-12-12 | 2022-06-19 | 4 Abwärtstrend | 28 | 50'124 | 20'553 |
| 2022-06-26 | 2023-01-15 | 1 Akkumulation | 30 | 21'029 | 20'885 |
| 2023-01-22 | 2026-09-06 | 2 Aufwärtstrend | 190 | 22'717 | 80'339 |

## Transaktionen

| Woche | Tranche | Seite | Kurs | Betrag | BTC |
|---|---|---|---|---|---|
| 2017-10-15 | S1 | verkauf | 5'680 | 1'153 | 0.2040 |
| 2017-11-19 | S2 | verkauf | 8'017 | 1'579 | 0.1980 |
| 2017-12-17 | S3 | verkauf | 18'953 | 3'734 | 0.1980 |
| 2018-12-02 | B1 | kauf | 4'102 | 2'198 | 0.5333 |
| 2018-12-30 | B2 | kauf | 3'836 | 2'134 | 0.5535 |
| 2019-04-14 | B3 | kauf | 5'163 | 2'134 | 0.4112 |
| 2021-12-12 | S1 | verkauf | 50'124 | 19'311 | 0.3872 |
| 2021-12-12 | S2 | verkauf | 50'124 | 18'743 | 0.3758 |
| 2021-12-12 | S3 | verkauf | 50'124 | 18'743 | 0.3758 |
| 2022-06-26 | B1 | kauf | 21'029 | 19'311 | 0.9137 |
| 2022-07-24 | B2 | kauf | 22'596 | 18'743 | 0.8253 |
| 2023-01-22 | B3 | kauf | 22'717 | 18'743 | 0.8209 |

## Signale

| Typ | Anzahl |
|---|---|
| COUNTER | 13 |
| PHASE_CHANGE | 8 |
| TRANCHE_DUE | 12 |
| TREND_BREAK | 2 |
| RESERVE | 8 |

## Datenabdeckung

| Jahr | Ø Abdeckung Kauf | Ø Abdeckung Verkauf | Wochen mit Datenlücke |
|---|---|---|---|
| 2014 | 80.0 % | 65.0 % | 0 |
| 2015 | 80.0 % | 65.0 % | 0 |
| 2016 | 80.0 % | 65.0 % | 0 |
| 2017 | 80.0 % | 65.0 % | 0 |
| 2018 | 80.0 % | 78.0 % | 0 |
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
