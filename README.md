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
| M2 | Motoren, Gates, Phasenmaschine, Backtest | fertig, Konfiguration `1.0-rc` |
| M3, M4, M6 | Oberfläche, Position, Journal, Verlauf | fertig (`index.html`) |
| M5 | Benachrichtigungen | fertig (`scripts/notify.mjs`) |
| M7 | Härtung | offen |

Der aktuelle Projektzustand steht in [`HANDOFF.md`](HANDOFF.md), die vollständige Spezifikation in [`SPEC.md`](SPEC.md).

## Aufbau

Eine GitHub Action holt die Daten und legt sie als JSON ins Repo. Die Seite liest später nur diese Dateien.

```
index.html             die Seite, eine Datei, ohne Abhängigkeiten
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
| Manuelle Werte | bei einem Issue `manual: …` | prüft und schreibt `data/manual.json` |
| Quellen-Check | manuell | prüft alle Datenquellen aus dem Runner |

## Lokal ausführen

```bash
node --test "test/**/*.test.mjs"   # Tests
node scripts/fetch.mjs             # Daten holen (dauert beim ersten Mal einige Minuten)
node scripts/build.mjs             # auswerten
node scripts/backtest.mjs          # Historie abspielen, Report schreiben
node scripts/notify.mjs --dry-run  # Benachrichtigungen anzeigen, nichts senden
```

Benötigt Node 22 oder neuer. Keine Abhängigkeiten.

## Testzustände

`index.html?fixture=kauf-tranche`, `?fixture=verkauf` und `?fixture=datenluecke` laden eine Datei aus `data/fixtures/` statt des echten Wochenstands. So lässt sich jede Ansicht prüfen, ohne auf den Markt zu warten.

## Manuelle Werte

Fünf On-Chain-Kennzahlen haben derzeit keine freie Quelle. Sie sind auf [charts.checkonchain.com](https://charts.checkonchain.com/) ablesbar und werden in [`data/manual.json`](data/manual.json) eingetragen:

```json
{
  "sth_realized_price": [ { "d": "2026-09-06", "v": 80100 } ],
  "supply_in_profit":   [ { "d": "2026-09-06", "v": 52.3 } ]
}
```

In den Einstellungen der Seite gibt es je Kennzahl ein Eingabefeld und einen Knopf zum Chart. Der Knopf „✓ Speichern" öffnet ein vorbereitetes GitHub-Issue; ein Workflow prüft die Werte und trägt sie automatisch ein. Eine Lesung gilt 30 Tage. STH-Realized-Price und Angebot im Gewinn wirken sofort; Reserve Risk, RHODL und LTH-Positionsänderung werden relativ bewertet und brauchen rund 26 Wochen Historie.

## Datenquellen

Coin Metrics Community (CC BY-NC 4.0), alternative.me, Wikimedia, Bitstamp, Coinbase, Deribit, mempool.space. Einzelheiten in [`data/ATTRIBUTION.md`](data/ATTRIBUTION.md).

Dieses Projekt ist privat und nicht-kommerziell.
