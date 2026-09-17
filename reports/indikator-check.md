# Indikator-Prüfung

Erstellt 2026-09-17 23:37 UTC · Konfiguration `1.0` · 844 Wochen bis 2026-09-13

Diese Prüfung ändert nichts. Sie misst, ob die Indikatoren noch unterscheiden, was sie unterscheiden sollen. Ein Befund ist ein Eintrag für die Neubewertung nach dem Zyklusende, keine Änderung an der laufenden Konfiguration (SPEC 10.5).

## Kurzfassung

5 von 16 Indikatorrollen sind auffällig: 0 rufen dauernd, 5 sind verstummt, 0 driften stark.

Letztes Kauf- oder Verkaufssignal vor 844 Wochen. Gleichlauf: 1 Indikatoren driften nach oben, 5 nach unten.

## A. Einzelne Indikatoren

Anteil der Wochen, in denen ein Indikator mindestens Score 70 erreicht, also „in Zone" steht. **Ruft dauernd** heisst 60 % oder mehr im laufenden Zyklus: Der Indikator hebt den Motor konstant an, ohne noch zu unterscheiden. **Verstummt** heisst 1 % oder weniger. **Driftet stark** heisst über 40 Prozentpunkte Unterschied zwischen den Zyklen.

| Indikator | Rolle | Familie | gesamt | bis 2015 | bis 2018 | bis 2022 | seit 2022 | Urteil |
|---|---|---|---|---|---|---|---|---|
| retail_attention | Verkauf | Euphorie | 9.3 % | – | 34.2 % | 0.0 % | 0.0 % | **verstummt** |
| pi_cycle | Verkauf | Relative Bewertung | 10.6 % | 28.6 % | 8.3 % | 6.8 % | 0.0 % | **verstummt** |
| bmsb_ext | Verkauf | Zeit & Trend | 12.6 % | 27.9 % | 11.8 % | 9.2 % | 0.5 % | **verstummt** |
| mvrv_z | Verkauf | Relative Bewertung | 11.7 % | 27.2 % | 15.7 % | 6.8 % | 0.5 % | **verstummt** |
| funding_30d | Verkauf | Euphorie | 5.0 % | – | – | 10.3 % | 0.0 % | **verstummt** |
| drawdown | Kauf | Zeit | 36.3 % | 43.8 % | 50.0 % | 31.1 % | 18.6 % | unauffällig |
| p_200w | Kauf | Bewertung | 16.7 % | 0.0 % | 9.8 % | 16.5 % | 27.1 % | unauffällig |
| mayer | Verkauf | Relative Bewertung | 10.7 % | 21.8 % | 12.3 % | 6.8 % | 1.5 % | unauffällig |
| mayer | Kauf | Bewertung | 19.4 % | 19.4 % | 14.7 % | 31.1 % | 12.1 % | unauffällig |
| p_rp | Kauf | Bewertung | 18.5 % | 22.6 % | 23.0 % | 20.9 % | 6.5 % | unauffällig |
| puell | Kauf | Miner | 10.9 % | 12.6 % | 9.8 % | 18.0 % | 3.0 % | unauffällig |
| mvrv_z | Kauf | Bewertung | 25.0 % | 31.7 % | 26.5 % | 25.2 % | 17.1 % | unauffällig |
| fng_fear_weeks | Kauf | Halter & Stimmung | 21.6 % | – | 28.2 % | 25.2 % | 16.6 % | unauffällig |
| cycle_clock | Verkauf | Zeit & Trend | 7.1 % | 0.0 % | 9.8 % | 9.7 % | 10.1 % | unauffällig |
| fng_4w | Verkauf | Euphorie | 7.4 % | – | 0.0 % | 9.7 % | 6.5 % | unauffällig |
| months_since_ath | Kauf | Zeit | 18.4 % | 23.4 % | 14.7 % | 18.9 % | 15.6 % | unauffällig |

## B. Trägt das Grundmodell noch?

Diese Prüfungen sind schwächer als Teil A, weil die Zyklusgrenzen selbst aus dem Modell stammen. Sie messen aber Grössen, die auch dann noch aussagen, wenn der Zyklus nicht mehr greift.

**1. Schweigen.**

Seit 844 Wochen kein Kauf- oder Verkaufssignal, also über einen vollen Zyklus hinweg. **Das ist für sich schon eine Aussage.**

**2. Wird der Rückgang zu flach?** Tor B verlangt mindestens -40 % unter dem Hoch. Bleibt ein Bärenmarkt darüber, öffnet kein Tor, egal wie gut die Indikatoren sind.

| Zyklus | tiefster Rückgang | Abstand zur Torschwelle |
|---|---|---|
| bis 2015 | -92.2 % | 52.2 Punkte Luft |
| bis 2018 | -81.6 % | 41.6 Punkte Luft |
| bis 2022 | -83.4 % | 43.4 Punkte Luft |
| seit 2022 | -75.7 % | 35.7 Punkte Luft |

**3. Stimmen die Zeitfenster?** Die Tiefs kamen bisher 9 bis 16 Monate nach dem Hoch. Fällt ein Wendepunkt weit daneben, war er nicht mehr vom Zyklus getrieben.

| Hoch | Tief | Abstand | im Fenster |
|---|---|---|---|
| 2013-12-04 | 2015-01-14 | 13.3 Monate | ✓ |
| 2017-12-17 | 2018-12-15 | 11.9 Monate | ✓ |
| 2021-11-10 | 2022-11-21 | 12.4 Monate | ✓ |

**4. Gleichlauf.** Driftet ein Indikator, ist das Zufall. Driften viele gleichzeitig in dieselbe Richtung, ist es ein Regimewechsel.

6 Indikatoren driften nennenswert, davon 1 nach oben und 5 nach unten. **Der überwiegende Teil zeigt in dieselbe Richtung.** Das spricht für einen Regimewechsel, nicht für Zufall.

---

**Was diese Prüfung nicht kann.** Sie kann nicht beweisen, dass der Zyklus zu Ende ist, und sie warnt nicht rechtzeitig. Bei vier Zyklen ist ein fünfter, der abweicht, statistisch bedeutungslos; erst der sechste wäre ein Muster. Ihr Nutzen ist bescheidener: Sie verwandelt ein Unbehagen in datierte Zahlen, mit denen sich entscheiden lässt.

