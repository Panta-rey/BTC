# Panta Rey · Ampel

Eine wöchentliche Bitcoin-Zyklus-Ampel: wann kaufen, wann verkaufen, warum.

Das Ziel ist minimales Handeln. Die Seite wertet einmal pro Woche aus, in welcher Zyklusphase Bitcoin steht, und meldet sich nur, wenn eine Kauf- oder Verkaufstranche fällig ist. Sie trifft keine Hochs und Tiefs auf den Punkt, sondern soll im oberen Viertel der Zyklusspanne verkaufen und im unteren Viertel kaufen.

**Keine Anlageberatung.** Das Modell beruht auf vier Zyklen und kann falsch liegen.

Schwesterprojekt: [Panta Rey · BTC Cockpit](https://github.com/Panta-rey/Panta-Rey-BTC-Dashboard) für die Lage von heute.

## Stand

| Meilenstein | Inhalt | Status |
|---|---|---|
| M0 | Quellen-Check | fertig, siehe `reports/sources-check.md` |
| M1 | Datenpipeline: Abruf, Wochenreihe, Indikatorwerte | fertig |
| M2 | Motoren, Gates, Phasenmaschine, Backtest | Code fertig, Kalibrierung offen |
| M3–M7 | Oberfläche, Position, Benachrichtigungen, Verlauf | offen |

Der aktuelle Projektzustand steht in [`HANDOFF.md`](HANDOFF.md), die vollständige Spezifikation in [`SPEC.md`](SPEC.md).

## Aufbau

Eine GitHub Action holt die Daten und legt sie als JSON ins Repo. Die Seite liest später nur diese Dateien.

```
scripts/fetch.mjs      Quellen  → data/raw/
scripts/build.mjs      data/raw → data/latest.json, weekly.json, events.json, state.json
scripts/backtest.mjs   Historie abspielen → reports/backtest.md
engine/                reine Rechenlogik, ohne Netzwerkzugriff
config/engine.json     alle Schwellen und Gewichte
test/                  node:test
```

| Workflow | Zeitplan (UTC) | Aufgabe |
|---|---|---|
| Wochenlauf | Mo 03:10 | Tests, Daten holen, auswerten, Backtest, committen |
| Tageslauf | täglich 06:15 | Tageswerte aktualisieren, löst nie Signale aus |
| Backtest | manuell + bei Änderung der Konfiguration | Report neu rechnen |
| Quellen-Check | manuell | prüft alle Datenquellen aus dem Runner |

## Lokal ausführen

```bash
node --test "test/**/*.test.mjs"   # Tests
node scripts/fetch.mjs             # Daten holen (dauert beim ersten Mal einige Minuten)
node scripts/build.mjs             # auswerten
node scripts/backtest.mjs          # Historie abspielen, Report schreiben
```

Benötigt Node 22 oder neuer. Keine Abhängigkeiten.

## Manuelle Werte

Der STH-Realized-Price hat derzeit keine freie Quelle. Er wird in [`data/manual.json`](data/manual.json) eingetragen:

```json
{ "sth_realized_price": { "value": 80100, "as_of": "2026-09-06", "note": "checkonchain" } }
```

Ohne Eintrag arbeitet der Trendfilter später nur mit dem Bull Market Support Band. Werte, die älter als 30 Tage sind, werden als „alt" gekennzeichnet.

## Datenquellen

Coin Metrics Community (CC BY-NC 4.0), alternative.me, Wikimedia, Bitstamp, Coinbase, Deribit, mempool.space. Einzelheiten in [`data/ATTRIBUTION.md`](data/ATTRIBUTION.md).

Dieses Projekt ist privat und nicht-kommerziell.
