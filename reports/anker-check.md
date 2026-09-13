# Ankerpunkte und monatliche Handeingabe

Erstellt 2026-09-13 17:44 UTC · Konfiguration `1.0` · Probelauf 24 Monate

> Lokale Prüfung gegen den eingefrorenen BGeometrics-Abzug. Sie ändert nichts an der Konfiguration und misst nur, ob die bestehenden Einstellungen zur Wirklichkeit passen. Datenquelle der Prüfreihen: BGeometrics.

## A. Sitzen die Ankerpunkte?

Geprüft wird mit derselben Funktion wie im Live-Betrieb, also absolut, über das Perzentil oder hybrid als Maximum. Zwei Zahlen entscheiden. **Der Anteil der Wochen in Zone** sagt, ob ein Indikator überhaupt unterscheidet: Wer in drei von vier Wochen meldet, hebt den Score nur konstant an. Und **die Lage an den bekannten Extremen** sagt, ob er dann meldet, wenn es darauf ankommt. Beides zusätzlich je Zyklus, weil absolute Ankerpunkte an einer Skala hängen, die über die Zyklen wandert.

### Reserve Risk

wird monatlich von Hand eingetragen · Bewertung hybrid · 836 Wochen Historie

**Anteil der Wochen in Zone (Score ab 70)**

| Zeitraum | Wochen | in Zone |
|---|---|---|
| gesamt | 836 | 74.8 % |
| bis Tief 2015 | 228 | 37.7 % |
| 2015 → 2018 | 204 | 75.5 % |
| 2018 → 2022 | 206 | 90.8 % |
| seit 2022 | 198 | 100.0 % |

Urteil: **zu locker.** Der Indikator meldet die meiste Zeit und trennt damit nichts.

**Achtung, Epochenbruch:** Der Anteil schwankt zwischen 37.7 % und 100.0 % je Zyklus. Die Gesamtzahl mischt damit Zeiträume, die nicht vergleichbar sind. Massgeblich ist die letzte Zeile.

<details><summary>Verteilung der Rohwerte</summary>

| Perzentil | Wert |
|---|---|
| 1. | 4.42e-4 |
| 5. | 5.74e-4 |
| 10. | 6.54e-4 |
| 25. | 9.53e-4 |
| 50. | 1.38e-3 |
| 75. | 2.83e-3 |
| 90. | 6.23e-3 |
| 95. | 0.0154 |
| 99. | 0.1573 |

</details>

Die absolute Schwelle für „in Zone" liegt bei 2.49e-3, das ist das 72.1. Perzentil der Gesamthistorie. Score am Median: 91.8.

**An den bekannten Zyklustiefs** (bester Score im Fenster von vier Wochen):

| Extrem | Woche | Rohwert | Perzentil | Score | in Zone? |
|---|---|---|---|---|---|
| 2015-01-14 | 2014-12-21 | 1.23e-3 | 1.4 | 100.0 | ✓ |
| 2018-12-15 | 2018-12-09 | 7.53e-4 | 5.3 | 100.0 | ✓ |
| 2022-11-21 | 2022-10-30 | 5.41e-4 | 3.8 | 100.0 | ✓ |

Alle 3 Extreme liegen in Zone.

Das ist kein Widerspruch, sondern der Kern des Problems: Der Indikator meldet an den Extremen **und** die meiste Zeit dazwischen. Er bestätigt, aber er unterscheidet nicht.

### Angebot im Verlust

wird monatlich von Hand eingetragen, aus dem Angebot im Gewinn gerechnet · Bewertung absolut · 843 Wochen Historie

**Anteil der Wochen in Zone (Score ab 70)**

| Zeitraum | Wochen | in Zone |
|---|---|---|
| gesamt | 843 | 13.8 % |
| bis Tief 2015 | 235 | 12.8 % |
| 2015 → 2018 | 204 | 19.6 % |
| 2018 → 2022 | 206 | 14.1 % |
| seit 2022 | 198 | 8.6 % |

Urteil: plausibel. Ein Extremzustand bleibt ein Extremzustand.

<details><summary>Verteilung der Rohwerte</summary>

| Perzentil | Wert |
|---|---|
| 1. | 0.0188 |
| 5. | 1.08 |
| 10. | 2.98 |
| 25. | 10.87 |
| 50. | 24.30 |
| 75. | 37.40 |
| 90. | 47.57 |
| 95. | 52.03 |
| 99. | 58.20 |

</details>

Die absolute Schwelle für „in Zone" liegt bei 45.04, das ist das 86.4. Perzentil der Gesamthistorie. Score am Median: 11.5.

**An den bekannten Zyklustiefs** (bester Score im Fenster von vier Wochen):

| Extrem | Woche | Rohwert | Perzentil | Score | in Zone? |
|---|---|---|---|---|---|
| 2015-01-14 | 2014-12-21 | 55.11 | 100.0 | 100.0 | ✓ |
| 2018-12-15 | 2018-12-09 | 57.87 | 97.1 | 100.0 | ✓ |
| 2022-11-21 | 2022-11-20 | 54.76 | 97.1 | 99.3 | ✓ |

Alle 3 Extreme liegen in Zone.

### RHODL-Ratio

zurückgestellt (HANDOFF §4a), hier nur zur Vollständigkeit · Bewertung Perzentil · 775 Wochen Historie

**Anteil der Wochen in Zone (Score ab 70)**

| Zeitraum | Wochen | in Zone |
|---|---|---|
| gesamt | 750 | 6.4 % |
| bis Tief 2015 | 142 | 9.9 % |
| 2015 → 2018 | 204 | 14.2 % |
| 2018 → 2022 | 206 | 0.0 % |
| seit 2022 | 198 | 2.5 % |

Urteil: plausibel. Ein Extremzustand bleibt ein Extremzustand.

<details><summary>Verteilung der Rohwerte</summary>

| Perzentil | Wert |
|---|---|
| 1. | 103 |
| 5. | 186 |
| 10. | 327 |
| 25. | 756 |
| 50. | 1994 |
| 75. | 6040 |
| 90. | 15808 |
| 95. | 33111 |
| 99. | 77311 |

</details>

**An den bekannten Zyklushochs** (bester Score im Fenster von vier Wochen):

| Extrem | Woche | Rohwert | Perzentil | Score | in Zone? |
|---|---|---|---|---|---|
| 2013-12-04 | 2013-11-10 | 53898 | 97.2 | 100.0 | ✓ |
| 2017-12-17 | 2017-12-03 | 52471 | 95.7 | 100.0 | ✓ |
| 2021-11-10 | 2021-10-24 | 15290 | 86.5 | 57.7 | ✗ |
| 2025-10-06 | 2025-10-05 | 3805 | 74.5 | 15.1 | ✗ |

2 von 4 Extremen liegen in Zone. 

### Abgabe der Langzeithalter

zurückgestellt (HANDOFF §4a) · Bewertung Perzentil · 843 Wochen Historie

**Anteil der Wochen in Zone (Score ab 70)**

| Zeitraum | Wochen | in Zone |
|---|---|---|
| gesamt | 818 | 11.5 % |
| bis Tief 2015 | 210 | 13.3 % |
| 2015 → 2018 | 204 | 12.7 % |
| 2018 → 2022 | 206 | 11.2 % |
| seit 2022 | 198 | 8.6 % |

Urteil: plausibel. Ein Extremzustand bleibt ein Extremzustand.

<details><summary>Verteilung der Rohwerte</summary>

| Perzentil | Wert |
|---|---|
| 1. | -72651 |
| 5. | -19409 |
| 10. | -11738 |
| 25. | -4029 |
| 50. | 893 |
| 75. | 7772 |
| 90. | 19676 |
| 95. | 31359 |
| 99. | 79817 |

</details>

**An den bekannten Zyklushochs** (bester Score im Fenster von vier Wochen):

| Extrem | Woche | Rohwert | Perzentil | Score | in Zone? |
|---|---|---|---|---|---|
| 2013-12-04 | 2013-11-24 | 52186 | 99.4 | 100.0 | ✓ |
| 2017-12-17 | 2017-11-19 | 23076 | 94.2 | 88.1 | ✓ |
| 2021-11-10 | 2021-10-31 | 23312 | 92.8 | 82.0 | ✓ |
| 2025-10-06 | 2025-11-02 | 15405 | 81.7 | 41.1 | ✗ |

3 von 4 Extremen liegen in Zone. 

## B. Was eine monatliche Handeingabe anrichtet

Simuliert wird eine Lesung je Monat, gültig 30 Tage, genau wie `build.mjs` sie verarbeitet. Jeder Monat der Historie dient einmal als Startmonat, jeder Probelauf dauert 24 Monate. Verglichen wird der so entstehende Score mit dem Score aus der vollständigen Tageshistorie. Gezählt wird der gefährliche Fall: **die dünne Reihe meldet „in Zone", die vollständige nicht.**

| Kennzahl | Probeläufe | mit falschem Signal | falsche Wochen | Anteil | Lesungen bis zur Freischaltung |
|---|---|---|---|---|---|
| Reserve Risk | 171 | 79 (46.2 %) | 462 von 18174 | 2.5 % | 6 |
| RHODL-Ratio | 156 | 117 (75.0 %) | 3213 von 16527 | 19.4 % | 6 |
| Abgabe der Langzeithalter | 189 | 178 (94.2 %) | 1794 von 19335 | 9.3 % | 7 |

**Reserve Risk, die ersten Fälle:**

| Start der Eingabe | Woche | Score dünn | Score wahr | Perzentil dünn | Perzentil wahr | Lesungen |
|---|---|---|---|---|---|---|
| 2010-07 | 2011-02-06 | 98 | 0 | 3.7 | – | 8 |
| 2010-08 | 2011-02-13 | 90 | 0 | 7.7 | – | 7 |
| 2010-09 | 2011-04-24 | 78 | 60 | 12.9 | 20.6 | 8 |
| 2010-10 | 2011-04-24 | 76 | 60 | 13.8 | 20.6 | 7 |
| 2010-11 | 2012-01-08 | 72 | 59 | 16.4 | 23.9 | 15 |
| 2010-12 | 2012-01-08 | 72 | 59 | 17.9 | 23.9 | 14 |

**RHODL-Ratio, die ersten Fälle:**

| Start der Eingabe | Woche | Score dünn | Score wahr | Perzentil dünn | Perzentil wahr | Lesungen |
|---|---|---|---|---|---|---|
| 2011-11 | 2013-11-03 | 87 | 65 | 92.4 | 88.0 | 25 |
| 2011-12 | 2013-11-03 | 100 | 65 | 96.0 | 88.0 | 24 |
| 2012-01 | 2013-05-05 | 90 | 19 | 93.0 | 75.6 | 17 |
| 2012-02 | 2013-04-07 | 93 | 49 | 93.5 | 84.6 | 15 |
| 2012-03 | 2013-04-07 | 100 | 49 | 100.0 | 84.6 | 14 |
| 2012-04 | 2013-03-03 | 74 | 0 | 89.8 | 60.3 | 12 |

**Abgabe der Langzeithalter, die ersten Fälle:**

| Start der Eingabe | Woche | Score dünn | Score wahr | Perzentil dünn | Perzentil wahr | Lesungen |
|---|---|---|---|---|---|---|
| 2009-05 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 24 |
| 2009-06 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 23 |
| 2009-07 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 22 |
| 2009-08 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 21 |
| 2009-09 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 20 |
| 2009-10 | 2011-04-17 | 70 | 0 | 90.0 | 47.5 | 19 |

**Befund:** Bei Reserve Risk und RHODL-Ratio und Abgabe der Langzeithalter erzeugt mehr als jeder zehnte Startzeitpunkt mindestens ein falsches Signal. Die Untergrenze von 26 Wochen genügt für monatlich eingetragene Werte nicht, weil 26 belegte Wochen nur rund 6 echten Messpunkten entsprechen. Naheliegende Abhilfe, zu entscheiden nach dem Zyklusende: den Perzentilteil erst ab 104 belegten Wochen zulassen oder die Untergrenze an der Zahl der Messpunkte statt der Wochen festmachen.

---

Beide Teile ändern nichts an `config/engine.json`. Die Konfiguration `1.0` bleibt bis zum Ende des laufenden Zyklus eingefroren (SPEC 10.5).

