# Panta Rey · Ampel — Spezifikation v1.0

Stand: 11. September 2026 · Status: bereit zur Umsetzung · Repo: `Panta-Rey-BTC-Ampel`

Diese Spezifikation beschreibt vollständig, was gebaut werden soll: Datenquellen, Rechenregeln, Zustandsmaschine, Oberfläche, Benachrichtigungen, Backtest und Umsetzungsreihenfolge. Alle Schwellen sind **Startwerte**. Sie werden in Meilenstein M2 per Backtest geprüft und danach als Konfiguration `v1.0` eingefroren.

> Kein Anlagerat. Das System ordnet Wahrscheinlichkeiten auf Basis von vier Zyklen ein. Es trifft keine Hochs und Tiefs, sondern soll im oberen Viertel der Zyklusspanne verkaufen und im unteren Viertel kaufen.

---

## 0. Zweck, Abgrenzung, Einordnung

**Zweck.** Eine GitHub Page, die einmal pro Woche drei Fragen beantwortet: In welcher Zyklusphase steht Bitcoin? Ist eine Kauf- oder Verkaufstranche fällig? Warum? Bei Handlungsbedarf kommt eine Benachrichtigung, sonst muss man die Seite nicht öffnen.

**Nicht-Ziele.** Kein Handel unterhalb der 4-Jahres-Ebene, keine Kursziele, keine Orderausführung, keine Tagessignale. Tageswerte werden angezeigt, lösen aber nie etwas aus.

**Verhältnis zum bestehenden Cockpit.** Beide Seiten teilen die Designsprache, beantworten aber verschiedene Fragen. Deshalb ein eigenes Repo mit gegenseitigem Link statt eines dritten Tabs im Cockpit.

| | Panta Rey · Cockpit (bestehend) | Panta Rey · Ampel (neu) |
|---|---|---|
| Frage | Wie ist die Lage heute? | Was ist in diesem Zyklus zu tun? |
| Zeithorizont | Tage bis Wochen | Monate bis Jahre |
| Takt | bei jedem Öffnen | Wochenschluss (So 24:00 UTC) |
| Leitbild | Tacho (Stimmung) | Ampel (Entscheidung) |
| Daten | Browser holt live (Binance, Deribit …) | GitHub Action holt, Seite liest JSON |
| On-Chain | manuell eingetragen | automatisch (Coin Metrics Community, eigene Berechnung; BGeometrics nach Lizenzklärung) |

---

## 1. Drei Grundentscheidungen

### 1.1 Datenpipeline statt Browser-Abruf

Eine GitHub Action holt die Daten, rechnet die Signale und legt JSON-Dateien ins Repo. Die Seite liest nur noch diese Dateien. Das bringt vier Vorteile:

- On-Chain-Kennzahlen wie Realized Price, MVRV und Puell kommen automatisch, das manuelle Nachtragen aus dem Cockpit entfällt weitgehend (Ausnahme je nach Lizenzlage: STH-Realized-Price, siehe 3.4).
- API-Schlüssel bleiben als GitHub-Secret geheim, Rate-Limits und CORS spielen im Browser keine Rolle mehr.
- Git wird zur Zeitreihen-Datenbank: jede Woche ein Commit, jede Entscheidung nachvollziehbar.
- Benachrichtigungen funktionieren, ohne dass jemand die Seite offen hat.

### 1.2 Zwei Pfade in beide Richtungen

Im zweiten Entwurf hatte nur die Verkaufsseite einen zweiten Pfad („stilles Hoch"). Der laufende Zyklus zeigt, dass auch **Tiefs flacher werden**: Der Rückgang vom Hoch (Oktober 2025, ~126'000 USD) erreichte im Juni 2026 rund −52 % bei ~60'000 USD. Der 200-Wochen-Schnitt wurde berührt, mehr als die Hälfte des Angebots lag im Verlust, der MVRV-Z-Score stand bei etwa 0,4. Der Realized Price (~53'500 USD) wurde bisher aber nicht unterschritten. Die alte Pflichtbedingung „MVRV-Z < 0 oder Preis < Realized Price" hätte deshalb **nie** ausgelöst.

Neu gibt es daher auch für Käufe einen Pfad A (klassische Kapitulation) und einen Pfad B (flaches Tief, relative Schwellen plus Zeitfenster). Details in Abschnitt 5.4.

### 1.3 Öffentliche Signale, private Position

GitHub-Pages-Repos sind öffentlich. Bestände, Kaufpreise und Tranchengrössen gehören deshalb **nie** ins Repo. Die Pipeline erzeugt nur allgemeine Signale („Kauftranche 2 von 3 fällig"). Die persönliche Position liegt ausschliesslich im Browser (`localStorage`, mit Export/Import wie im Cockpit). Der konkrete Handlungssatz („≈ 0,21 BTC verkaufen") wird im Browser aus Signal und Position berechnet.

---

## 2. Architektur

```
┌─────────────── GitHub Actions (cron, UTC) ───────────────┐
│  scripts/fetch.mjs   Quellen → data/raw/*.json            │
│  scripts/build.mjs   raw → engine/ → data/*.json          │
│  scripts/notify.mjs  neue Events → GitHub Issue / ntfy    │
└───────────────────────────┬──────────────────────────────┘
                            │ git commit (nur bei Änderung)
┌───────────────────────────▼────────── GitHub Pages ──────┐
│  index.html                                               │
│   liest  data/latest.json   (aktueller Stand, ~20 KB)     │
│          data/weekly.json   (Wochenhistorie, ~200 KB)     │
│          data/events.json   (Phasenwechsel, Tranchen)     │
│   plus   localStorage       (Position, Journal – privat)  │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Repo-Struktur

```
Panta-Rey-BTC-Ampel/
├── index.html                 Oberfläche (eine Datei, wie Cockpit)
├── engine/                    reine Logik, keine Netzwerkzugriffe
│   ├── normalize.mjs          Ankerpunkte, Perzentile
│   ├── indicators.mjs         Indikator-Definitionen
│   ├── engines.mjs            Kauf-/Verkaufsmotor, Familien, Konvergenz
│   └── phases.mjs             Zustandsmaschine, Tranchen, Flags
├── scripts/
│   ├── fetch.mjs              Datenabruf je Quelle, isoliert
│   ├── build.mjs              Wochenauswertung, JSON-Ausgabe
│   ├── backtest.mjs           Wiederabspielen der Historie, Report
│   ├── notify.mjs             Benachrichtigungen
│   └── check-sources.mjs      Quellen-Check (Meilenstein M0)
├── config/
│   ├── engine.json            Schwellen, Gewichte, Anker (versioniert)
│   └── sources.json           Endpunkte, Fallback-Reihenfolge
├── data/
│   ├── raw/                   Rohdaten je Kennzahl (täglich)
│   ├── seed/btc_daily_2010_2011.csv   einmaliger Preis-Seed (vor Bitstamp)
│   ├── manual.json            manuelle Notwerte (optional)
│   ├── fixtures/              Testzustände für ?fixture=
│   ├── state.json             Zustand der Phasenmaschine (Ausgabe, nicht Eingabe)
│   ├── phases.json            Phase und Scores je Woche (für den Verlauf)
│   ├── latest.json
│   ├── weekly.json
│   └── events.json
├── reports/                   backtest.md, backtest.json, sources-check.md (automatisch)
├── test/                      node:test, Fixtures
├── .github/workflows/
│   ├── check-sources.yml      Quellen-Check (M0), manuell
│   ├── weekly.yml
│   ├── daily.yml
│   └── backtest.yml
├── README.md
└── SPEC.md                    dieses Dokument
```

Laufzeit: Node 22 oder neuer (Node 20 ist seit April 2026 ohne Sicherheitsupdates) (natives `fetch`, `node:test`). Ziel ist **null Abhängigkeiten** in Pipeline und Engine. Die Engine ist deterministisch: gleiche Eingaben ergeben gleiche Ausgaben. Das ist Voraussetzung für Backtest und Tests.

### 2.2 Workflows

| Workflow | Zeitplan (UTC) | Aufgabe | Signale? |
|---|---|---|---|
| `weekly.yml`, Etappe A | Mo 01:20 (`20 1 * * 1`) | On-Chain-Batch A holen | nein |
| `weekly.yml`, Etappe B | Mo 02:50 (`50 2 * * 1`) | On-Chain-Batch B holen, volle Auswertung, Events, Benachrichtigung | **ja** |
| `daily.yml` | täglich 06:15 | Preis, Fear & Greed, Funding, Wikipedia → `latest.json` mit Kennzeichen „vorläufig" | nein |
| `backtest.yml` | manuell + bei Änderung in `config/` | Backtest neu rechnen, `reports/backtest.md` schreiben | nein |

Die Wochenauswertung ist zweigeteilt, weil die freie BGeometrics-API höchstens 8 Anfragen pro Stunde erlaubt (Abschnitt 3.3).

**Stolpersteine bei GitHub Actions**

| Thema | Regel |
|---|---|
| Zeitzone | Cron läuft in UTC. Verzögerungen von Minuten bis zu einer Stunde sind normal. |
| Geo-Blocking | GitHub-Runner stehen in US-Rechenzentren. `api.binance.com` und `fapi.binance.com` antworten dort mit HTTP 451. Das Cockpit funktioniert, weil dein Browser in der Schweiz abruft. **In der Pipeline deshalb kein Binance** (Ersatz siehe 3.1). |
| Inaktivität | In öffentlichen Repos deaktiviert GitHub geplante Workflows nach 60 Tagen ohne Aktivität. Die wöchentlichen Daten-Commits sollten das verhindern. Falls nicht, kommt eine E-Mail von GitHub, und der Health-Check (9.3) meldet sich zusätzlich. |
| Parallelität | `concurrency: { group: data, cancel-in-progress: false }`, damit sich zwei Läufe nicht gegenseitig die Commits zerschiessen. |
| Rechte | `permissions: contents: write, issues: write`. |
| Secrets | `BGEOMETRICS_TOKEN`, optional `NTFY_TOPIC`. |
| Commits | Nur committen, wenn sich Dateien geändert haben. Autor `github-actions[bot]`, Nachricht `data: Woche 2026-09-06`. |
| Caching | GitHub Pages cacht ~10 Minuten. Die Seite lädt mit `cache: "no-store"` und zeigt den Zeitstempel aus der JSON-Datei, nicht die Ladezeit. |

### 2.3 Wochendefinition

Eine Woche endet am Sonntag um 24:00 UTC. Der **Wochenschluss** ist der Tagesschlusskurs dieses Sonntags. Die Woche wird mit dem Sonntagsdatum bezeichnet (`week_id: "2026-09-06"`). Alle Wochen-Durchschnitte werden aus diesen Wochenschlüssen gebildet, unabhängig davon, wie eine Börse ihre Wochenkerzen schneidet.

Jede Signalbedingung wird ausschliesslich auf Wochenschlüssen geprüft. **Jeder Phasenwechsel braucht zwei Wochenschlüsse in Folge.** Diese eine Regel verhindert Flackern und ist leicht zu merken.

---

## 3. Datenquellen

### 3.1 Quellen je Kennzahl

| Kennzahl | Primärquelle | Fallback | Historie ab | Max. Alter |
|---|---|---|---|---|
| BTC-Tagesschluss | Bitstamp OHLC (`/api/v2/ohlc/btcusd/`, `step=86400`, `limit=1000`, keyless) | Coinbase Exchange Candles (max. 300 pro Abruf), dann Coin Metrics `PriceUSD` vor 2011 | 2010 (mit Seed) | 2 Tage |
| Preis-Seed vor 2011 | einmalig aus BGeometrics-Preisreihe oder Coin Metrics Community `PriceUSD` → `data/seed/` | – | 2010 | – |
| MVRV-Z-Score | selbst berechnet aus Coin Metrics Community (`CapMrktCurUSD`, `CapMVRVCur`) | BGeometrics (nach Lizenzklärung) | 2010 | 3 Tage |
| Realized Price | abgeleitet: Coin Metrics `PriceUSD` ÷ `CapMVRVCur` | BGeometrics (nach Lizenzklärung) | 2010 | 3 Tage |
| STH-Realized-Price | BGeometrics | `data/manual.json` | 2011 | 10 Tage (manuell: 30) |
| Angebot im Gewinn/Verlust | BGeometrics (Supply in Profit) | – | 2011 | 10 Tage |
| Reserve Risk | BGeometrics | – | 2011 | 10 Tage |
| RHODL-Ratio | BGeometrics | – | 2011 | 10 Tage |
| LTH-Positionsänderung 30T | BGeometrics | – | 2012 | 10 Tage |
| Puell Multiple | selbst: Coin Metrics `IssTotUSD` ÷ 365-Tage-Schnitt | Blockchain.com `miners-revenue` (Näherung inkl. Gebühren) | 2010 | 3 Tage |
| Hashrate / Hash Ribbons | selbst aus Coin Metrics `HashRate` | mempool.space `/api/v1/mining/hashrate/all` | 2010 | 3 Tage |
| Fear & Greed | alternative.me (`/fng/?limit=0&format=json`) | – | Feb. 2018 | 3 Tage |
| Funding 30T | Deribit `public/get_funding_rate_history` (BTC-PERPETUAL) | OKX (nur ~3 Monate Historie) | 2019 | 3 Tage |
| Wikipedia-Aufrufe „Bitcoin" | Wikimedia REST API (`/metrics/pageviews/per-article/…/daily/…`, en + de, Header `User-Agent` Pflicht) | – | Juli 2015 | 7 Tage |
| Blockhöhe (nächstes Halving) | mempool.space `/api/blocks/tip/height` | Blockchain.com | – | 7 Tage |
| Makro (nur Kontext) | bestehender Cloudflare Worker `/macro` | – | – | 7 Tage |

**Hinweis zu den Pfaden.** Die genauen BGeometrics-Endpunkte stehen in der interaktiven Doku (`api.bgeometrics.com/scalar.html`). Das Script `check-sources.mjs` (Meilenstein M0) ruft jede Quelle einmal ab und schreibt die gefundenen Pfade, Datumsbereiche und letzten Werte nach `config/sources.json`. Welche Coin-Metrics-Kennzahlen im kostenlosen Community-Tarif noch enthalten sind, wird dort ebenfalls geprüft.

### 3.2 Regeln für saubere Daten

| Regel | Begründung |
|---|---|
| Eine Reihe stammt immer aus **einer** Quelle. Beim Wechsel auf den Fallback wird die ganze Historie aus dem Fallback neu gerechnet, nie zusammengestückelt. | Anbieter rechnen z. B. den MVRV-Z-Score mit unterschiedlicher Standardabweichung. Ein Bruch in der Reihe verfälscht jedes Perzentil. |
| Der Wochenwert einer Tageskennzahl ist der Wert vom Sonntag. Fehlt er, wird bis zu 10 Tage zurückgegriffen, danach gilt er als „fehlt". Ab 4 Tagen Alter wird er zusätzlich als „alt" gekennzeichnet. | Einheitlicher Stichtag, aber Toleranz für Anbieter, die ein paar Tage nachhinken. |
| Fehlende Werte werden für Signale nie interpoliert. | Lieber eine Lücke zeigen als eine erfundene Zahl. |
| Überschreitet ein Wert sein Höchstalter, gilt er als „alt": Er wird angezeigt, zählt ab M2 aber nicht in den Score. | Wie beim Cockpit mit `ANCHOR_MAX_AGE_DAYS`. |
| Rohdaten bleiben in `data/raw/` erhalten. | Jede Auswertung ist reproduzierbar. |

`data/manual.json` dient als Notnagel und lässt sich über die GitHub-Weboberfläche oder die GitHub-App bearbeiten:

```json
{
  "sth_realized_price": { "value": 80100, "as_of": "2026-09-06", "note": "checkonchain" }
}
```

### 3.3 Abrufbudget BGeometrics (frei: 8 pro Stunde, 15 pro Tag; nur relevant nach Lizenzklärung, siehe 3.4)

| Lauf | Kennzahlen | Anfragen |
|---|---|---|
| Etappe A (Mo 01:20) | MVRV-Z, Realized Price, STH-RP, Supply in Profit, Puell, Reserve Risk | 6 |
| Etappe B (Mo 02:50) | RHODL, LTH-Positionsänderung, Hash Ribbons, Funding | 4 |
| Täglich (06:15) | Funding | 1 |
| Reserve für Wiederholungen | – | 2–3 |

Der erste Lauf holt die komplette Historie. Danach genügen Abrufe ab dem letzten gespeicherten Datum, falls der Endpunkt einen Datumsfilter kennt. Sonst wird wöchentlich die ganze Reihe geholt, was bei Tagesdaten seit 2010 nur wenige hundert Kilobyte pro Kennzahl ausmacht.

### 3.4 Nutzungsbedingungen der Quellen

Beim Quellen-Check (M0) zeigte sich: Die Gratis-Stufe von BGeometrics ist für persönliche Projekte gedacht. Laut Nutzungsbedingungen gelten zwei Dinge als kommerzielle Weiterverbreitung, die den Professional-Tarif erfordert: der Einsatz des Tokens von Systemen, die nicht dem Schlüsselinhaber gehören (GitHub-Runner), und jede Anwendung, die die Daten an Endnutzer ausliefert (eine öffentliche Seite). Die Pipeline in dieser Form wäre damit nicht gedeckt.

| Quelle | Bedingungen | Folge für die Ampel |
|---|---|---|
| Coin Metrics Community | Creative Commons BY-NC 4.0: nicht-kommerziell, mit Quellenangabe | Primärquelle für MVRV, Realized Price, Puell, Hashrate. Seit Oktober 2025 wurden einzelne Community-Kennzahlen gestrichen, M0 prüft, was noch da ist. |
| BGeometrics (frei) | persönliche Nutzung; Runner und öffentliche Anzeige nur mit Professional-Tarif | erst nach schriftlicher Zusage einsetzen; bis dahin nur Doku lesen |
| alternative.me | frei, Quellenangabe neben den Daten | Fusszeile und Kachel nennen die Quelle |
| Wikimedia Pageviews | offene Daten | ohne Einschränkung |
| Bitstamp, Deribit, mempool.space, Blockchain.com | öffentliche Schnittstellen mit Rate-Limits | ein Abruf pro Tag oder Woche ist unkritisch |

Ohne BGeometrics fehlen STH-Realized-Price, Angebot im Verlust, Reserve Risk, RHODL-Ratio und LTH-Abgabe. Dann gilt: STH-Realized-Price kommt monatlich aus `manual.json` (wie im Cockpit), die übrigen werden nach 5.2 herausgerechnet. Betroffen sind vor allem Gate B (Angebot im Verlust) und die Familie „Halterverhalten" des Verkaufs-Motors. Die Anpassung erfolgt nach dem Quellen-Check in Meilenstein M2, falls BGeometrics nicht zusagt.

---

## 4. Indikatoren

### 4.1 Katalog

Der Name ist das, was die Oberfläche zeigt. Die Leitfrage steht klein darunter und erklärt die Kachel ohne Fachwissen.

| ID | Name | Leitfrage | Berechnung | Motor → Familie |
|---|---|---|---|---|
| `mvrv_z` | MVRV-Z-Score | Wie teuer ist Bitcoin gegenüber dem Einstandswert aller Coins? | Quelle | Kauf → Bewertung; Verkauf → Relative Bewertung |
| `p_rp` | Abstand zum Realized Price | Ist Bitcoin günstiger als der Durchschnittskäufer? | Wochenschluss ÷ Realized Price | Kauf → Bewertung |
| `p_200w` | Abstand zum 200-Wochen-Schnitt | Wie nah ist der Preis am Langzeitschnitt? | Wochenschluss ÷ SMA der letzten 200 Wochenschlüsse | Kauf → Bewertung |
| `mayer` | Mayer Multiple | Wie weit liegt der Preis über dem 200-Tage-Schnitt? | Sonntagsschluss ÷ SMA 200 Tage | Kauf → Bewertung; Verkauf → Relative Bewertung |
| `supply_loss` | Angebot im Verlust | Wie viele Coins liegen unter Wasser? | 100 − Supply in Profit (%) | Kauf → Halter & Stimmung |
| `reserve_risk` | Reserve Risk | Wie überzeugt sind Langzeithalter im Verhältnis zum Preis? | Quelle, bewertet als Perzentil | Kauf → Halter & Stimmung |
| `fng_fear_weeks` | Dauer der extremen Angst | Wie lange herrscht schon Panik? | Anzahl der letzten 8 Wochen mit Wochendurchschnitt Fear & Greed < 25 | Kauf → Halter & Stimmung |
| `puell` | Puell Multiple | Stehen die Miner unter Druck? | Tageserlös ÷ 365-Tage-Schnitt | Kauf → Miner |
| `hash_ribbons` | Hash Ribbons | Ist die Miner-Kapitulation vorbei? | 30-Tage- vs. 60-Tage-Schnitt der Hashrate | Kauf → Miner |
| `drawdown` | Abstand vom Allzeithoch | Wie tief ist der Fall? | Wochenschluss ÷ höchster Tagesschluss bisher − 1 | Kauf → Zeit |
| `months_since_ath` | Monate seit dem Hoch | Passt das Timing zu einem Zyklustief? | Tage seit Allzeithoch ÷ 30,44 | Kauf → Zeit |
| `cycle_clock` | Zyklus-Uhr | Wie weit ist der Zyklus fortgeschritten? | Tage seit dem **relevanten Halving** (6.2); steht dieses noch aus, zählt der Wert als 0, nicht als „fehlt" | Verkauf → Zeit & Trend |
| `bmsb_ext` | Überdehnung über dem Trendband | Rennt der Preis dem Trend davon? | Wochenschluss ÷ Oberkante Bull Market Support Band | Verkauf → Zeit & Trend |
| `pi_cycle` | Pi-Cycle-Nähe | Nähern sich die beiden Top-Linien? | SMA 111 Tage ÷ (2 × SMA 350 Tage) | Verkauf → Relative Bewertung |
| `rhodl` | RHODL-Ratio | Übernehmen neue Käufer von alten Haltern? | Quelle, bewertet als Perzentil | Verkauf → Halterverhalten |
| `lth_dist` | Abgabe der Langzeithalter | Verkaufen die alten Hände? | −(LTH-Positionsänderung 30T), bewertet als Perzentil | Verkauf → Halterverhalten |
| `fng_4w` | Gier-Niveau | Wie gierig ist der Markt? | 4-Wochen-Durchschnitt Fear & Greed | Verkauf → Euphorie |
| `funding_30d` | Hebel der Spekulanten | Wie viel zahlen gehebelte Käufer? | Durchschnitt Funding 30 Tage (% pro 8 h) | Verkauf → Euphorie |
| `retail_attention` | Aufmerksamkeit der Öffentlichkeit | Schaut die breite Masse hin? | 4-Wochen-Durchschnitt Wikipedia-Aufrufe (en + de), Perzentil | Verkauf → Euphorie |

**Filter ohne Score.** Diese Linien entscheiden über Phasenwechsel, fliessen aber nicht in die Motoren ein:

| ID | Name | Berechnung |
|---|---|---|
| `bmsb` | Bull Market Support Band | Unterkante = min(SMA 20 Wochen, EMA 21 Wochen), Oberkante = max(beide) |
| `sth_rp` | Einstand der Kurzfrist-Halter | STH-Realized-Price aus Quelle |

**Kontext ohne Score.** In einem eingeklappten Bereich: Abweichung vom Power-Law-Korridor, True Market Mean (Cointime), ETF-Nettozuflüsse 4 Wochen, Makro aus dem Worker. Sie helfen beim Einordnen, lösen aber nichts aus.

### 4.2 Normierung auf 0–100

Jeder Indikator erhält **zwei** Teilscores: `score_buy` (100 = maximal kaufwürdig) und `score_sell` (100 = maximal überhitzt). Ein Indikator, der nur einem Motor dient, hat für den anderen keinen Wert.

**Ankerfunktion.** Eine Liste von Punkten `(Wert → Score)`. Dazwischen wird linear interpoliert, ausserhalb auf den Endwert begrenzt. Das funktioniert für steigende wie fallende Zusammenhänge.

**Perzentil über 4 Jahre.** `pct4y(v)` = Anteil der letzten 208 Wochenwerte (inklusive aktuell), die ≤ v sind, in Prozent. Bei weniger als 104 Wochen Historie wird die verfügbare Historie genommen und `pct_basis: "kurz"` gesetzt.

**Hybrid.** Wo sowohl absolute als auch relative Schwellen sinnvoll sind: `score = max(Anker_absolut(v), Anker_perzentil(pct4y(v)))`. Das fängt sinkende Zyklusextreme ab, ohne die bewährten absoluten Marken aufzugeben.

**Signalzone.** Ein Indikator gilt als „in Zone", wenn sein Score für den betrachteten Motor ≥ 70 ist, und als „nahe" bei 50–69. Nur „in Zone" zählt für die Konvergenz.

### 4.3 Anker Kauf-Motor (`score_buy`)

| ID | Methode | Ankerpunkte (Wert → Score) |
|---|---|---|
| `mvrv_z` | Hybrid | absolut: 2,0 → 0 · 1,0 → 40 · 0,5 → 65 · 0,0 → 90 · −0,5 → 100 · Perzentil: 50 → 0 · 30 → 40 · 15 → 75 · 5 → 100 |
| `p_rp` | absolut | 1,8 → 0 · 1,4 → 40 · 1,15 → 70 · 1,0 → 90 · 0,9 → 100 |
| `p_200w` | absolut | 2,0 → 0 · 1,5 → 30 · 1,15 → 65 · 1,0 → 90 · 0,85 → 100 |
| `mayer` | absolut | 1,2 → 0 · 1,0 → 30 · 0,8 → 75 · 0,65 → 100 |
| `supply_loss` | absolut (%) | 20 → 0 · 35 → 40 · 45 → 70 · 55 → 100 |
| `reserve_risk` | Perzentil | 50 → 0 · 25 → 50 · 10 → 85 · 3 → 100 |
| `fng_fear_weeks` | absolut (Wochen) | 0 → 0 · 2 → 40 · 4 → 75 · 6 → 100 |
| `puell` | absolut | 1,0 → 0 · 0,8 → 30 · 0,6 → 65 · 0,5 → 85 · 0,4 → 100 |
| `hash_ribbons` | Regel | Kaufsignal (30T kreuzt 60T nach einer Kapitulation wieder nach oben) in den letzten 8 Wochen → 100 · Kapitulation läuft (30T < 60T) → 60 · sonst 0 |
| `drawdown` | absolut (%) | −30 → 0 · −45 → 40 · −60 → 75 · −75 → 100 |
| `months_since_ath` | absolut (Monate) | 4 → 0 · 7 → 40 · 10 → 85 · 11 bis 15 → 100 · 18 → 60 · 24 → 0 |

### 4.4 Anker Verkaufs-Motor (`score_sell`)

| ID | Methode | Ankerpunkte (Wert → Score) |
|---|---|---|
| `cycle_clock` | absolut (Tage) | vor dem relevanten Halving zählt 0 · 300 → 0 · 420 → 30 · 480 → 70 · 520 bis 560 → 100 · 620 → 70 · 720 → 20 · 800 → 0 |
| `bmsb_ext` | absolut | 1,1 → 0 · 1,3 → 40 · 1,5 → 75 · 1,7 → 100 |
| `mvrv_z` | Perzentil | 70 → 0 · 85 → 50 · 93 → 80 · 98 → 100 |
| `mayer` | Hybrid | absolut: 1,5 → 0 · 2,0 → 50 · 2,4 → 90 · 2,8 → 100 · Perzentil: 70 → 0 · 85 → 50 · 95 → 90 · 99 → 100 |
| `pi_cycle` | absolut + Regel | 0,80 → 0 · 0,90 → 50 · 0,97 → 80 · 1,00 → 100 · Kreuzung in den letzten 8 Wochen → 100 |
| `rhodl` | Perzentil | 70 → 0 · 85 → 50 · 95 → 100 |
| `lth_dist` | Perzentil | 70 → 0 · 90 → 70 · 97 → 100 |
| `fng_4w` | absolut | 55 → 0 · 70 → 50 · 80 → 85 · 90 → 100 |
| `funding_30d` | absolut (% / 8 h) | 0,01 → 0 · 0,02 → 40 · 0,04 → 80 · 0,06 → 100 |
| `retail_attention` | Perzentil | 70 → 0 · 85 → 50 · 95 → 90 · 99 → 100 |

---

## 5. Die zwei Motoren

### 5.1 Familien und Gewichte

**Kauf-Motor**

| Familie | Gewicht | Indikatoren (innen gleich gewichtet) |
|---|---|---|
| Bewertung | 50 | `mvrv_z`, `p_rp`, `p_200w`, `mayer` |
| Halter & Stimmung | 20 | `supply_loss`, `reserve_risk`, `fng_fear_weeks` |
| Miner | 15 | `puell`, `hash_ribbons` |
| Zeit | 15 | `drawdown`, `months_since_ath` |

**Verkaufs-Motor**

| Familie | Gewicht | Indikatoren |
|---|---|---|
| Zeit & Trend | 40 | `cycle_clock` (innen 25), `bmsb_ext` (innen 15) |
| Relative Bewertung | 25 | `mvrv_z`, `mayer`, `pi_cycle` |
| Halterverhalten | 20 | `rhodl`, `lth_dist` |
| Euphorie | 15 | `fng_4w`, `funding_30d`, `retail_attention` |

Die Asymmetrie ist gewollt: Tiefs erkennt man an der Bewertung, Hochs eher an Zeit und Trend, weil die Bewertungsspitzen von Zyklus zu Zyklus sinken.

### 5.2 Rechenweg

1. **Familienscore** = gewichteter Durchschnitt der verfügbaren Indikatoren der Familie. Eine Familie zählt nur, wenn mindestens 50 % ihres Innengewichts verfügbar sind.
2. **Motorscore** = gewichteter Durchschnitt der verfügbaren Familienscores, auf ganze Zahlen gerundet. Fehlende Familien werden herausgerechnet, nicht als 0 gezählt.
3. **Abdeckung** = Summe der verfügbaren Familiengewichte ÷ 100. Liegt sie beim aktiven Motor unter 60 %, gilt die Woche als Datenlücke (6.6).
4. **Konvergenz** = Anzahl der Indikatoren „in Zone" und Anzahl der Familien, aus denen sie stammen. Anzeige: „5 von 11 in Zone · 3 Familien".
5. **Anpassung bei fehlenden Quellen.** Die geforderte Familienzahl ist `min(Sollwert, verfügbare Familien)`, mindestens aber 2. Fällt eine Familie dauerhaft aus, weil eine Quelle fehlt (3.4), darf daran kein Signal scheitern. Die Oberfläche zeigt in diesem Fall einen Hinweis, dass die Anforderung gesenkt wurde.

### 5.3 Zonen des Motorscores

| Score | Zone | Bedeutung |
|---|---|---|
| 0–39 | ruhig | nichts in Sicht |
| 40–59 | Annäherung | bereit machen, noch nicht handeln |
| 60–79 | aktiv | Zone erreicht, sofern Gate und Konvergenz erfüllt |
| 80–100 | stark | ausgeprägtes Extrem |

### 5.4 Gates

Ein hoher Durchschnitt allein löst nie etwas aus. Zusätzlich muss ein Gate erfüllt sein und die Konvergenz stimmen.

**Kaufzone** = (Gate A **oder** Gate B) **und** Kauf-Score ≥ 60 **und** mindestens 4 Indikatoren in Zone aus mindestens 3 Familien.

| Gate | Name | Bedingung (Wochenschluss) |
|---|---|---|
| A | Klassische Kapitulation | MVRV-Z < 0 **oder** Preis < Realized Price |
| B | Flaches Tief | alle vier: Monate seit Hoch ≥ 6 · Drawdown ≤ −40 % · Preis ≤ 1,05 × 200-Wochen-Schnitt · (Angebot im Verlust ≥ 45 % **oder** `pct4y(mvrv_z)` ≤ 15) |

**Top-Zone** wird auf einem von zwei Wegen erreicht:

| Weg | Name | Bedingung |
|---|---|---|
| E1 | Überhitzung | (Tage seit relevantem Halving ≥ 450 **oder** `pct4y(mvrv_z)` ≥ 90) **und** Verkauf-Score ≥ 60 **und** mindestens 3 Indikatoren in Zone aus mindestens 2 Familien |
| E2 | Zeitfenster | Tage seit relevantem Halving ≥ 480 **und** Verkauf-Score ≥ 40 × Abdeckung |

**Warum die Schwelle von E2 an die Abdeckung gekoppelt ist.** Fehlt dauerhaft eine Familie, weil eine Quelle nicht lizenziert ist (3.4), sind deren Gewichtspunkte gar nicht erreichbar. Eine feste Schwelle wäre dann strenger als beabsichtigt. Bei 80 % Abdeckung gilt also 32 statt 40. Kommt die Quelle zurück, steigt die Schwelle von selbst wieder. Weg E1 bleibt bewusst ungekoppelt: Der Pfad der Überhitzung soll anspruchsvoll bleiben, sonst öffnet er in einer Parabel zu früh.

E2 ist die Lehre aus 2025: Das Hoch kam im Zeitfenster, aber die Überhitzungsindikatoren blieben lau. Eine grobe Überschlagsrechnung ergibt für Oktober 2025 einen Verkauf-Score um 45–50, also unter 60. Ohne E2 wäre die Top-Zone nie aktiv geworden, und der Trendbruch hätte nichts ausgelöst.

### 5.5 Trendfilter

| Begriff | Definition (zwei Wochenschlüsse in Folge) |
|---|---|
| Trendbruch | Wochenschluss < Unterkante Bull Market Support Band **und** < STH-Realized-Price |
| Tief bestätigt | Wochenschluss > Oberkante Bull Market Support Band **und** > STH-Realized-Price |

Fehlt der STH-Realized-Price (auch manuell), gilt nur das Band, und die Seite zeigt den Hinweis „Trendfilter vereinfacht".

---

## 6. Phasenmaschine

### 6.1 Phasen

| Phase | Name | Aktiver Motor | Deine Aufgabe |
|---|---|---|---|
| ① | Akkumulation | Kauf | Kauftranchen ausführen |
| ② | Aufwärtstrend | Verkauf (im Hintergrund) | halten, ggf. Korrekturen mit Reserve nachkaufen |
| ③ | Verteilung | Verkauf | Verkaufstranchen ausführen |
| ④ | Abwärtstrend | Kauf (im Hintergrund) | warten, Cash parken |

Die Phasen laufen **nur vorwärts** ④ → ① → ② → ③ → ④. Es gibt keinen Rückweg. Das hält die Maschine einfach und verhindert Hin und Her.

### 6.2 Relevantes Halving

Die Zyklus-Uhr zählt ab dem **ersten Halving nach dem Beginn des aktuellen Zyklus**. Zyklusbeginn ist der Eintritt in Phase ①. Ist dieses Halving noch nicht erfolgt, steht die Zyklus-Uhr auf 0, und beide Zeitbedingungen (E1, E2) sind falsch.

Ohne diese Regel würde im März 2024 (Allzeithoch vor dem Halving) die Uhr ab dem Halving 2020 zählen, ~1'400 Tage anzeigen und fälschlich eine Top-Zone öffnen.

Halving-Daten: 28.11.2012 · 09.07.2016 · 11.05.2020 · 20.04.2024 · nächstes bei Block 1'050'000, geschätzt April 2028. Die Schätzung rechnet die Pipeline wöchentlich aus der Blockhöhe und dem Blocktempo der letzten 2'016 Blöcke.

### 6.3 Übergänge

Jeder Phasenwechsel braucht die Bedingung an **zwei Wochenschlüssen in Folge**. Ein Zähler je Phase zählt die erfüllten Wochen und fällt auf 0, sobald eine Woche die Bedingung verfehlt.

| Übergang | Name | Bedingung | Ausgelöste Signale |
|---|---|---|---|
| ④ → ① | Kaufzone | Kaufzone (5.4) | Kauftranche B1 |
| ① → ② | Tief bestätigt | Tief bestätigt (5.5) | Kauftranche B3 (inkl. einer noch offenen B2), Reserve bilden |
| ② → ③ | Top-Zone | E1 oder E2 (5.4) | keine Tranche; Verkaufsplan wird scharf |
| ③ → ④ | Trendbruch | Trendbruch (5.5) | alle noch offenen Verkaufstranchen |

### 6.4 Tranchen innerhalb einer Phase

Tranchen innerhalb einer Phase brauchen nur **einen** Wochenschluss, weil die Phase selbst schon bestätigt ist.

| Tranche | Phase | Auslöser |
|---|---|---|
| B1 | ① | Eintritt in ① |
| B2 | ① | frühestens 4 Wochen nach B1, wenn in dieser Woche die Kaufzone-Bedingung erfüllt ist **oder** der Kauf-Score ≥ 80 liegt. Spätestens 12 Wochen nach B1 wird B2 in jedem Fall fällig (Zeitstaffelung). |
| B3 | ① → ② | Tief bestätigt. Ist B2 noch offen, wird sie mit B3 zusammengelegt. |
| S1 | ③ | Verkauf-Score ≥ 70 |
| S2 | ③ | Verkauf-Score ≥ 80, frühestens 4 Wochen nach S1 |
| S3 | ③ | Verkauf-Score ≥ 90, frühestens 4 Wochen nach S2 |
| S-Rest | ③ → ④ | Trendbruch: alle noch offenen S-Tranchen in einer Transaktion. Die Meldung erfolgt auch dann, wenn keine mehr offen ist. |

So erwischt Pfad A (Überhitzung) mehrere Hochs einer Top-Zone mit je einer Tranche. Pfad B (Trendbruch) räumt auf, was übrig ist. In einem Zyklus wie 2025 verkauft nur Pfad B.

### 6.5 Hinweise und Sonderfälle

| Kennzeichen | Bedingung | Wirkung |
|---|---|---|
| Nachkauf-Chance | nur in ②: Drawdown vom 52-Wochen-Hoch ≥ 25 % **und** Wochenschluss ≤ 1,02 × STH-RP **und** 7-Tage-Durchschnitt Fear & Greed ≤ 25 | Hinweis-Chip, Signal R. Nutzt die Hälfte der Reserve. Danach 12 Wochen Pause. |
| Ausserordentliche Kaufgelegenheit | in ② oder ③: Kauf-Score ≥ 70 | Banner, Signal R (Reserve). Kein Phasenwechsel. Beispiel: März 2020. Die Schwelle liegt tiefer als bei der Überhitzung, weil im Aufwärtstrend die Zeit-Familie des Kauf-Motors fast null beiträgt. |
| Überhitzung in der Bärenphase | in ④ oder ①: Verkauf-Score ≥ 80 | Banner zur Information, keine Aktion. Die Kernposition trägt. |
| Unklar | beide Motoren ≥ 50 **und** Abstand < 15 Punkte | gelbe Lampe, Text „Signale widersprechen sich – nichts tun" |
| Zyklus-Anomalie | in ②, mehr als 720 Tage seit relevantem Halving ohne Top-Zone | Hinweis: „Zyklus läuft länger als je zuvor. Kernposition trägt, Bewertungsgate bleibt aktiv." |
| Neues Hoch in ④ | Allzeithoch während Phase ④ | Hinweis „Kernposition trägt". Kein Rückweg, kein Nachkauf. |

### 6.6 Datenlücke

Ist die Abdeckung des aktiven Motors < 60 % oder sind alle On-Chain-Werte älter als 10 Tage, wird die Woche **nicht** ausgewertet.

Die Schwelle liegt bei 60 % und nicht höher, weil die beiden tragenden Verkaufs-Familien (Zeit & Trend mit 40, Relative Bewertung mit 25) zusammen 65 % ergeben. Mit 70 % wäre die Maschine in jedem Zeitraum ohne Stimmungsdaten blind gewesen: Fear & Greed gibt es erst ab Februar 2018, Funding ab 2019. Genau daran ist im ersten Backtest das Hoch von Dezember 2017 vorbeigelaufen. Die Zähler bleiben stehen (weder erhöht noch zurückgesetzt), die Seite zeigt ein gelbes Banner. Nach zwei Wochen Lücke geht eine Benachrichtigung raus.

### 6.7 Ablauf eines Wochenlaufs

1. Rohdaten laden, Wochenreihe bis `week_id` bilden.
2. Indikatorwerte und Alter berechnen.
3. Beide Motoren, Abdeckung, Konvergenz und Gates berechnen.
4. Datenlücke prüfen. Falls ja: `latest.json` mit Kennzeichen schreiben, Schritte 5 bis 7 überspringen.
5. Zähler für den nächsten Übergang der aktuellen Phase fortschreiben.
6. Zähler ≥ 2: Phase wechseln, Events erzeugen.
7. Tranchenregeln, Nachkauf-Chance, Alarme und „Unklar" prüfen.
8. `latest.json` und `state.json` schreiben, Zeile an `weekly.json` und neue Events an `events.json` anhängen.
9. `notify.mjs` verschickt neue Events.

### 6.8 Startzustand und Zustandsdatei

Der Zustand liegt in `data/state.json` (Phase, Beginn, Zähler, ausgelöste Tranchen, Zyklusbeginn, relevantes Halving). Er wird **nicht** von Hand gesetzt, sondern beim ersten Einrichten durch Abspielen der Historie erzeugt:

```json
"bootstrap": { "start_week": "2014-01-05", "start_phase": 4 }
```

Anfang 2014 lag Bitcoin nach dem Hoch vom Dezember 2013 im Abwärtstrend, Phase ④ ist also korrekt. Der Backtest spielt von dort bis heute ab und schreibt den Endzustand. Jeder Wochenlauf prüft zusätzlich per Neuberechnung, ob `state.json` noch mit der Historie übereinstimmt, und warnt bei Abweichung.

Für Notfälle gibt es `phase_override` in `config/engine.json`. Jede Nutzung erzeugt ein Event und ist in der Oberfläche sichtbar.

---

## 7. Tranchen, Position und Handlungssätze

### 7.1 Voreinstellungen

| Parameter | Standard | Bereich |
|---|---|---|
| Kernposition | 40 % des BTC-Bestands beim Eintritt in ③ | 30–50 % |
| Aufteilung Verkauf S1 / S2 / S3 | 34 / 33 / 33 % des handelbaren Bestands | frei |
| Aufteilung Kauf B1 / B2 / B3 | 34 / 33 / 33 % des Cash beim Eintritt in ① | frei |
| Reserve | 15 % des Cash, zurückbehalten bei B3 | 10–20 % |

**Handelbarer Bestand** = BTC-Bestand beim Eintritt in ③ minus Kernposition. Die Kernposition wird nie verkauft. Sie schützt vor dem Fall, dass die Indikatoren versagen oder der Zyklus bricht.

**Reserve.** Sie wird bei B3 zurückbehalten und nur für „Nachkauf-Chance" und „Ausserordentliche Kaufgelegenheit" verwendet. Ist sie beim Eintritt in ③ noch da, bleibt sie Cash und wirkt wie eine frühe Gewinnmitnahme.

### 7.2 Aufgabentrennung

| Wer | Weiss was | Wo |
|---|---|---|
| Pipeline | Phase, Scores, welche Tranche fällig ist | öffentlich im Repo |
| Browser | Bestand, Cash, erledigte Tranchen, Journal | privat in `localStorage` |

Ist eine Tranche fällig, zeigt die Seite einen Knopf „Erledigt". Beim Antippen öffnet sich ein kleines Formular (Datum, optional Preis und Menge), das einen Journaleintrag erzeugt. Unerledigte Tranchen bleiben fällig, bis sie erledigt oder übersprungen werden. Überspringen ist erlaubt, wird aber im Journal vermerkt.

### 7.3 Handlungssätze

Die wichtigste Zeile der Seite. Sie folgt dieser Tabelle. `{…}` wird im Browser aus der Position gerechnet, fehlt die Position, entfällt der Klammerteil.

| Lage | Lampe | Handlungssatz |
|---|---|---|
| ④, Kauf-Score < 40 | aus | Nichts tun. Die Kaufzone ist noch weit weg. |
| ④, Kauf-Score 40–59 oder ein Gate erfüllt | gelb | Bereit machen. Die Kaufzone rückt näher, noch nicht kaufen. |
| ④, Übergang läuft (Zähler 1 von 2) | gelb | Kaufzone erreicht. Wird sie nächste Woche bestätigt, ist Tranche 1 fällig. |
| ①, B1 fällig | grün | Kauftranche 1 von 3 fällig {≈ 3'400 CHF}. |
| ①, B1 erledigt, B2 noch nicht fällig | grün | Tranche 1 erledigt. Tranche 2 frühestens am {Datum}. |
| ①, B2 fällig | grün | Kauftranche 2 von 3 fällig {≈ 3'300 CHF}. |
| ①, B1 und B2 ausgelöst, Tief noch nicht bestätigt | grün | Tranche 3 folgt, sobald das Tief bestätigt ist. Bis dahin nichts tun. |
| ②, Verkauf-Score < 40 | aus | Halten. Keine Aktion nötig. |
| ②, Nachkauf-Chance | aus + Chip | Halten. Optional: Nachkauf mit halber Reserve {≈ 750 CHF}. |
| ②, Verkauf-Score 40–59 oder Zeitfenster in < 60 Tagen | gelb | Halten. Die Top-Zone rückt näher, Verkaufsplan prüfen. |
| ③, keine Tranche fällig, Score < 70 | gelb | Top-Zone. Noch nichts verkaufen. Verkauft wird bei Überhitzung oder beim Trendbruch. |
| ③, S1/S2/S3 fällig | rot | Verkaufstranche {n} von 3 fällig {≈ 0,21 BTC}. |
| ③ → ④, Trendbruch | rot | Trendbruch bestätigt. Alle offenen Verkaufstranchen fällig {≈ 0,42 BTC}. Kernposition behalten. |
| Unklar | gelb | Signale widersprechen sich. Nichts tun. |
| Datenlücke | gelb | Daten unvollständig. Diese Woche keine Entscheidung. |

### 7.4 Optionales Modul: Sparplan-Faktor

Wer monatlich frisches Geld investiert, kann es nach Phase gewichten. Was in ③ und ④ nicht investiert wird, sammelt sich als Cash und finanziert die Mehrbeträge in ①.

| Phase | Faktor auf den Monatsbetrag |
|---|---|
| ① (Kauf-Score ≥ 80) | 3× |
| ① | 2× |
| ② | 1× |
| ③ | 0× |
| ④ | 0,5× |

---

## 8. Oberfläche

### 8.1 Gestaltungsidee

Die Seite gehört sichtbar zur Panta-Rey-Familie: gleiche Farben, gleiche Schrift, gleiche Karten, gleiche Erklär-Sheets. Sie unterscheidet sich durch **ein** lautes Element: eine echte, senkrechte Ampel. Das Cockpit zeigt mit dem Tacho die Stimmung von heute, die Ampel zeigt die Entscheidung dieses Zyklus. Name und Hauptelement sind damit dasselbe. Alles andere bleibt ruhig.

| Token | Wert | Rolle |
|---|---|---|
| `--bg` | `#0A0E16` | Hintergrund (wie Cockpit) |
| `--card` | `#141C28` | Karten |
| `--line` | `#222D3C` | Linien, Rahmen |
| `--ink` | `#E8EDF2` | Text |
| `--mut` | `#7E8B9C` | Nebentext |
| `--buy` | `#2DD4A7` | Kaufen, Kauf-Motor (Cockpit-Teal) |
| `--ready` | `#F0B429` | Bereit machen, Annäherung (Cockpit-Amber) |
| `--sell` | `#F0656A` | Verkaufen, Verkaufs-Motor (Cockpit-Coral) |
| `--info` | `#5B9DF0` | Kontext, Hinweise |
| `--lamp-off` | `#111925` | ausgeschaltete Lampe |

Schrift: Space Grotesk für Zahlen, Handlungssatz und Phasennamen, Systemschrift für Fliesstext (wie Cockpit). Zahlen mit `font-variant-numeric: tabular-nums` und Schweizer Tausendertrennung (`126'000`).

Zwei bewusste Abweichungen vom Cockpit: Abschnittstitel in normaler Satzschreibung statt Versalien, damit die Ampel das einzige laute Element bleibt. Und keine Tacho-Grafik, damit die beiden Seiten auf den ersten Blick unterscheidbar sind.

### 8.2 Layout

**Mobil (bis 440 px breit, zentriert wie das Cockpit)**

```
┌──────────────────────────────────────┐
│ ⬡ PANTA REY  Ampel           ⚙   ↗  │ Kopf, ↗ = zum Cockpit
│ Wochenschluss 6. Sep. 2026           │
├──────────────────────────────────────┤
│  ┌────┐                              │
│  │ ○  │  Akkumulation                │ Held
│  │ ○  │  Kauftranche 2 von 3 fällig  │
│  │ ●  │  ≈ 3'300 CHF                 │
│  └────┘  Kaufzone über flaches Tief  │
│          seit 5 Wochen  [ Erledigt ] │
├──────────────────────────────────────┤
│ ① Akkumulation ② Auf ③ Vert ④ Ab    │ Phasenleiste
├──────────────────────────────────────┤
│ Kauf-Motor        73  ███████▌░░    │ Motoren
│ 6 von 11 in Zone, 4 Familien         │
│ Verkaufs-Motor     8  (Hintergrund)  │
├──────────────────────────────────────┤
│ Bis zum nächsten Schritt             │ Checkliste
│ ✓ über Bandoberkante     74'900      │
│ ✗ über STH-Einstand      80'100      │
│   bestätigte Wochen      0 von 2     │
├──────────────────────────────────────┤
│ Zyklus-Uhr  (Zeitstrahl)             │
├──────────────────────────────────────┤
│ Deine Position  (nur dieses Gerät)   │
├──────────────────────────────────────┤
│ Indikatoren des Kauf-Motors          │
│   Bewertung 50 %                     │
│   [Kachel] [Kachel] [Kachel] …       │
│ Verkaufs-Motor ▸   Kontext ▸         │
├──────────────────────────────────────┤
│ Verlauf seit 2014                    │
├──────────────────────────────────────┤
│ Journal                              │
└──────────────────────────────────────┘
```

**Desktop (ab 960 px)**: zwei Spalten. Links eine feste Spalte von 400 px, beim Scrollen fixiert: Held, Phasenleiste, Motoren, Checkliste, Position. Rechts: Zyklus-Uhr, Kacheln im Zweierraster, Verlauf, Journal. Die linke Spalte beantwortet „Was tun?", die rechte „Warum?".

Ausrichtung: linksbündig, nur die Ampel sitzt frei links neben dem Text. Keine zentrierten Textblöcke.

### 8.3 Bausteine

**Kopf.** Wortmarke wie im Cockpit plus „Ampel". Seitentitel im Browser: „Panta Rey · Ampel". Darunter der Stand der Auswertung („Wochenschluss 6. Sep. 2026"). Kommt der Tageslauf dazu, erscheint dezent „Tageswerte vom 11. Sep., vorläufig". Rechts Einstellungen und Link zum Cockpit.

**Ampel (Held).** Gehäuse etwa 72 × 188 px, dunkel mit feinem Rand, drei runde Lampen von 48 px Durchmesser. Von oben nach unten wie im Strassenverkehr: Rot (Verkaufen), Gelb (Bereit machen), Grün (Kaufen). Es leuchtet höchstens eine Lampe. Eine leuchtende Lampe hat einen weichen Schein, das ist der einzige Glow der Seite. Ausgeschaltete Lampen sind dunkles Glas (`--lamp-off`) mit einem schwachen Ring. Die Bedeutung steckt dreifach drin: Position der Lampe, Farbe und Text daneben. Das hilft bei Farbsehschwäche.

Rechts neben der Ampel stehen der Phasenname (klein, `--mut`), der Handlungssatz aus 7.3 (Space Grotesk, 22/28, Gewicht 600), eine Begründungszeile in einem Satz und, nur wenn eine Tranche fällig ist, der Knopf „Erledigt" mit Nebenlink „Überspringen".

Einzige automatische Bewegung: Öffnet man die Seite zum ersten Mal nach einem Phasenwechsel, schaltet die neue Lampe einmal sichtbar ein (Ausblenden der alten 300 ms, Einblenden der neuen 600 ms). Gemerkt wird das über die ID des letzten gesehenen Events in `localStorage`. Bei `prefers-reduced-motion` gibt es keine Animation.

**Phasenleiste.** Vier Segmente in Zyklusreihenfolge ① ② ③ ④. Das aktuelle Segment ist gefüllt und zeigt „seit 11 Wochen", bereits durchlaufene Segmente des laufenden Zyklus sind schwach getönt. Die Nummern sind hier gerechtfertigt, weil die Phasen tatsächlich eine Abfolge sind.

**Motoren.** Der aktive Motor als breiter Balken von 0 bis 100 mit Marken bei 40, 60 und 80, in seiner Farbe (Kauf teal, Verkauf coral). Daneben eine Mini-Kurve der letzten 12 Wochen. Darunter die Konvergenz und die Gates als kleine Chips („Gate A ✗", „Gate B ✓"). Der inaktive Motor steht als eine graue Zeile darunter.

**Checkliste „Bis zum nächsten Schritt".** Die Pipeline liefert für den nächsten möglichen Übergang jede Teilbedingung mit aktuellem Wert, Zielwert und Status. Die Seite zeigt sie als Liste mit ✓ und ✗ sowie dem Zähler „bestätigte Wochen 1 von 2". Damit wird die Maschine durchschaubar: Man sieht nicht nur „gelb", sondern was genau noch fehlt.

**Zyklus-Uhr.** Ein waagrechter Zeitstrahl vom letzten Allzeithoch bis etwa zwei Jahre nach dem nächsten Halving. Schraffiert sind das historische Tief-Fenster (9 bis 16 Monate nach dem Hoch, teal) und das Top-Fenster (450 bis 640 Tage nach dem relevanten Halving, coral). Markiert sind das nächste Halving (mit „geschätzt") und die Heute-Linie. Dünne Striche zeigen, wo die Tiefs und Hochs der früheren Zyklen relativ lagen. Unterschrift: „Muster aus vier Zyklen, keine Prognose."

**Deine Position.** BTC-Bestand, Cash, Kernposition (mit Schloss-Symbol), Reserve. Dazu die Tranchen des laufenden Zyklus als Punkte mit Zuständen: offen, fällig, erledigt, übersprungen. Hinweis: „Nur auf diesem Gerät gespeichert." Ohne Eingabe zeigt die Karte: „Trag deinen Bestand ein, dann rechnet die Seite die Tranchen in CHF und BTC aus."

**Indikator-Kacheln.** Gruppiert nach Familien des aktiven Motors. Jede Familie hat eine Kopfzeile mit Name, Gewicht und Familienscore. Die Familien des inaktiven Motors und der Kontext sind eingeklappt. Aufbau einer Kachel:

| Zeile | Inhalt |
|---|---|
| 1 | Name und Zustandspunkt: gefüllt in Motorfarbe = in Zone, halb gefüllt = nahe, leerer Kreis = neutral, gestrichelt = fehlt, Etikett „alt" bei überschrittenem Höchstalter |
| 2 | Leitfrage, klein in `--mut` |
| 3 | Rohwert gross mit Einheit, daneben Tendenzpfeil über 4 Wochen (↗ → ↘) |
| 4 | Skala 0–100 des Motorscores mit Markierung bei 70 |
| 5 | Sparkline über 4 Jahre (Wochenwerte) mit der Linie, ab der der Indikator in Zone ist |
| 6 | „BGeometrics, Stand 6. Sep." und „zuletzt in Zone: Nov. 2022" |

Tippen öffnet das Erklär-Sheet.

**Erklär-Sheet.** Bottom-Sheet wie im Cockpit mit fünf Abschnitten: Was es misst. Was der Wert gerade bedeutet (aus Vorlage, z. B. „0,41 liegt im untersten 18 % der letzten vier Jahre"). Wie es zählt (Ankerpunkte, Gewicht, Familie). Frühere Extreme (von der Pipeline berechnet: die letzten drei Phasen in Zone mit Datum). Grenzen. Texte in Anhang B.

**Verlauf.** Logarithmischer BTC-Chart seit 2014. Im Hintergrund die Phasen als Farbbänder (④ `--line`, ① teal mit 12 % Deckkraft, ② ohne Band, ③ coral mit 12 %). Kauftranchen als Dreieck ▲ unter der Kurve, Verkaufstranchen als ▼ darüber. Unter dem Chart schaltbar die beiden Motorscores. Umschalter „Dieser Zyklus" und „Seit 2014". Antippen zeigt Woche, Preis, Phase und Scores. Umsetzung als eigenes SVG (wie der Cockpit-Tacho) oder mit uPlot (~50 KB, cdnjs). Keine schwere Chart-Bibliothek.

**Journal.** Zwei Reiter: „Meine Entscheidungen" (lokal) und „Systemsignale" (aus `events.json`). Knöpfe „Backup exportieren" und „Backup importieren" wie im Cockpit.

**Einstellungen.** Bestand und Cash, Währung (CHF oder USD), Kernposition, Reserve, Tranchenaufteilung, Sparplan-Modul an oder aus mit Monatsbetrag, Backup, Hinweis zu Benachrichtigungen, Anzeige der Konfigurationsversion mit Link auf `config/engine.json`.

### 8.4 Zustände

| Zustand | Darstellung |
|---|---|
| Laden | Ampelgehäuse mit drei dunklen Lampen, Text „Lade Wochenstand" |
| Daten älter als 8 Tage | gelbes Banner: „Letzter Wochenstand vom 30. Aug. Die Pipeline hat seither nicht geliefert. Im Actions-Tab des Repos prüfen." |
| Datenlücke | gelbe Lampe, Handlungssatz aus 7.3, betroffene Kacheln gestrichelt |
| `latest.json` nicht erreichbar | „Wochenstand konnte nicht geladen werden. Ist GitHub Pages für das Repo aktiv?" |
| Unklar | gelbe Lampe, beide Motoren gleich gross dargestellt |
| Alarm des inaktiven Motors | Banner in `--info` über den Motoren |
| Keine Position eingetragen | Handlungssätze ohne Beträge, Hinweis in der Positionskarte |

Für die Entwicklung lädt `index.html?fixture=2022-06-19` statt `latest.json` eine Datei aus `data/fixtures/`. So lässt sich jeder Zustand prüfen, ohne auf den Markt zu warten.

### 8.5 Barrierefreiheit und Qualität

Textkontrast mindestens 4,5 : 1. Der Handlungssatz steht in einem Bereich mit `aria-live="polite"`, die Ampel hat ein `aria-label` wie „Ampel grün: Kaufen". Sichtbarer Tastaturfokus, Tippflächen mindestens 44 px. Keine Information nur über Farbe. Die Seite funktioniert ohne Schriften aus dem Netz (Systemschrift als Rückfall). Ladeziel: erste Anzeige unter einer Sekunde auf dem Handy, `weekly.json` wird erst geladen, wenn der Verlauf sichtbar wird.

### 8.6 Begriffe

Die Oberfläche verwendet durchgehend dieselben Wörter: Kaufzone, Top-Zone, Tranche, Kernposition, Reserve, Trendbruch, Tief bestätigt. Knöpfe sagen, was passiert: „Erledigt", „Überspringen", „Backup exportieren". Die Rückmeldung nach „Erledigt" lautet „Tranche 2 als erledigt gespeichert."

---

## 9. Benachrichtigungen

### 9.1 Ereignisse

| Typ | Wann | Beispieltext |
|---|---|---|
| `COUNTER` | erste von zwei nötigen Wochen erfüllt | „Kaufzone diese Woche erreicht. Bestätigt sie sich am nächsten Wochenschluss, ist Tranche 1 fällig." |
| `PHASE_CHANGE` | Phasenwechsel | „Phase ① Akkumulation hat begonnen. Kauftranche 1 von 3 fällig." |
| `TRANCHE_DUE` | Tranche innerhalb einer Phase fällig | „Verkaufstranche 2 von 3 fällig (Verkauf-Score 82)." |
| `TREND_BREAK` | Übergang ③ → ④, immer (auch ohne offene Tranchen) | „Trendbruch bestätigt. Alle offenen Verkaufstranchen fällig. Kernposition behalten." |
| `RESERVE` | Nachkauf-Chance oder ausserordentliche Kaufgelegenheit | „Nachkauf-Chance im Aufwärtstrend: halbe Reserve einsetzen möglich." |
| `ALERT` | Überhitzung in der Bärenphase | „Verkauf-Score 81 in Phase ④. Keine Aktion, zur Information." |
| `DATA_GAP` | zwei Wochen Datenlücke | „Seit zwei Wochen unvollständige Daten. Quellen prüfen." |
| `PIPELINE_STALE` | über 9 Tage kein erfolgreicher Wochenlauf | „Keine Wochenauswertung seit 10 Tagen. Actions-Tab prüfen." |
| `YEARLY_REVIEW` | jedes Jahr am 1. Januar | „Jahres-Review: Backup exportiert? Kernposition noch passend? Quellen alle grün?" |

Jedes Event hat eine eindeutige ID (`2026-09-06:TRANCHE_DUE:B2`) und wird nur einmal verschickt. `notify.mjs` merkt sich das Feld `notified_at` in `events.json`.

### 9.2 Kanäle

**Standard: GitHub Issue.** Die Action eröffnet pro Event ein Issue mit Label `signal` oder `technik`. GitHub schickt dafür eine E-Mail und, mit der GitHub-App und „Watching" auf dem Repo, eine Push-Nachricht. Kein Drittdienst nötig. Das Issue bleibt offen, bis du es schliesst, das ist gleichzeitig deine Quittung.

**Optional: ntfy.sh.** Ein `POST` auf `https://ntfy.sh/<topic>` mit den Headern `Title` und `Priority` erzeugt eine Push-Nachricht in der ntfy-App. Weil jeder mitlesen kann, der den Topic-Namen kennt, wird ein zufälliger Name verwendet und als Secret `NTFY_TOPIC` hinterlegt. Die Texte enthalten keine Beträge.

### 9.3 Gesundheitsprüfung

Der Tageslauf prüft, wann die letzte Wochenauswertung war. Liegt sie länger als 9 Tage zurück, entsteht ein `PIPELINE_STALE`-Event. Sind die Workflows ganz deaktiviert, schickt GitHub selbst eine E-Mail, und die Seite zeigt das Banner aus 8.4.

---

## 10. Backtest und Validierung

### 10.1 Ablauf

Die Engine wird Woche für Woche vom Startzustand (6.8) bis heute abgespielt, mit genau denselben Funktionen wie im Live-Betrieb. Jede Woche sieht nur Daten bis zu ihrem Wochenschluss. Perzentile werden nur aus der Vergangenheit gebildet. Ausführungspreis einer Tranche ist der Wochenschluss der Signalwoche, Gebühr 0,5 % pro Transaktion. Steuern werden nicht modelliert.

Datenverfügbarkeit vor 2018: Fear & Greed fehlt (ab Februar 2018), Funding fehlt (ab 2019), Wikipedia fehlt vor Juli 2015. Die Familien werden dann nach 5.2 herausgerechnet. Der Report weist die Abdeckung je Woche aus.

### 10.2 Vergleich

| Strategie | Beschreibung |
|---|---|
| Halten | 1 BTC ab Januar 2014, nie verkaufen |
| Ampel | 1 BTC ab Januar 2014, Kernposition 40 %, Tranchen nach Abschnitt 6 und 7 |
| Sparplan | fester Monatsbetrag ab Januar 2014 |
| Sparplan mit Faktor | gleicher Monatsbetrag, gewichtet nach 7.4 |

Verglichen werden jeweils Halten mit Ampel und Sparplan mit Sparplan mit Faktor.

**Kennzahlen:** Endbestand in BTC, Endwert in USD, grösster Rückgang des Depotwerts, Anzahl Transaktionen, durchschnittlicher Verkaufspreis ÷ Zyklushoch, durchschnittlicher Kaufpreis ÷ Zyklustief, Wochen je Phase.

### 10.3 Abnahmekriterien für Konfiguration v1.0

| Kriterium | Ziel |
|---|---|
| Kaufzone an den Tiefs 2015, 2018 und 2022 | Phase ① beginnt höchstens 16 Wochen vor oder nach dem Tief; durchschnittlicher Kaufpreis ≤ 1,6 × Zyklustief |
| Verkauf an den Hochs 2017, 2021 und 2025 | handelbarer Bestand ist verkauft, bevor der Preis 50 % unter dem Hoch liegt; durchschnittlicher Verkaufspreis ≥ 0,6 × Zyklushoch |
| Handelsaufwand | höchstens 8 Tranchen pro Zyklus ohne Reserve-Käufe |
| Nutzen | Strategie „Ampel" endet mit mehr BTC als „Halten" |
| Robustheit | Wird eine einzelne Schwelle um ±15 % verschoben, fällt höchstens einer von drei Zyklen durch |

### 10.4 Erwartete Fixpunkte

Diese Erwartungen stammen aus der Logik der Regeln und groben historischen Werten. Der Backtest prüft sie. Weicht er ab, wird die Abweichung im Report dokumentiert. Parameter werden nur geändert, wenn die Änderung in allen Zyklen hilft, nie für einen einzelnen.

| Woche | Erwartung |
|---|---|
| Jan. 2015 | ① über Gate A |
| Dez. 2017 | ③, S1 bis S3 fällig |
| Jan./Feb. 2018 | Trendbruch, ③ → ④ |
| Nov./Dez. 2018 | ① über Gate A |
| Apr./Mai 2019 | Tief bestätigt, ① → ② |
| März 2020 | ②, ausserordentliche Kaufgelegenheit |
| Apr. 2021 | ③ über E1 (Bewertungsgate), S1 und S2 |
| Mai/Juni 2021 | Trendbruch, ③ → ④ |
| Juni 2022 | ① über Gate A |
| Jan. 2023 | Tief bestätigt, ① → ② |
| März 2024 | ② bleibt (relevantes Halving noch nicht erfolgt) |
| Aug. 2024 | ②, Nachkauf-Chance |
| Aug./Sep. 2025 | ② → ③ über E2 |
| Nov. 2025 | Trendbruch, ③ → ④ |
| Juni 2026 | ① über Gate B (200-Wochen-Schnitt berührt, über 50 % des Angebots im Verlust, MVRV-Z ~0,4) |

Zu 2021: Die Maschine verkauft im Frühling und verpasst das zweite Hoch im November. Das ist der bewusste Preis der Vorwärts-Regel. Die Kernposition fährt das zweite Hoch mit, und der Wiederkauf 2022 liegt weit unter beiden Verkaufspreisen.

### 10.5 Schutz vor Überanpassung

Vier Zyklen sind wenig. Deshalb gilt: Schwellen werden **vor** dem ersten Backtest aus diesem Dokument übernommen, nicht nach dem Ergebnis gesucht. Zusätzlich eine „Einen-Zyklus-auslassen"-Prüfung: Kalibrierung auf zwei Zyklen, Test auf dem dritten, reihum. Der Report enthält eine Empfindlichkeitstabelle (jede Schwelle ±15 %). Nach der Abnahme wird die Konfiguration als `v1.0` eingefroren und erst nach dem Ende des laufenden Zyklus überprüft, nie mittendrin.

### 10.6 Report

`reports/backtest.md` wird automatisch erzeugt und enthält: Zusammenfassung je Zyklus, Phasen-Zeitleiste, Liste aller Tranchen mit Datum und Preis, Strategievergleich, Empfindlichkeitstabelle, Abweichungen von 10.4, Abdeckung der Datenquellen je Jahr.

---

## 11. Umsetzungsplan

| Meilenstein | Inhalt | Fertig, wenn … |
|---|---|---|
| M0 Quellen-Check | `check-sources.mjs` ruft jede Quelle ab, schreibt `config/sources.json` | für jede Kennzahl ist Primärquelle oder Fallback bestätigt, Preisquelle ohne Binance steht |
| M1 Datenpipeline | `fetch.mjs`, Wochenreihe, Indikatorwerte, `latest.json` ohne Motoren, `weekly.yml` | zwei Wochenläufe hintereinander grün und committed |
| M2 Engine und Backtest | Normierung, Motoren, Gates, Phasenmaschine, Tranchen, `backtest.mjs`, `state.json` | Tests grün, Report erzeugt, Abnahmekriterien erfüllt oder Abweichungen begründet, Konfiguration v1.0 eingefroren |
| M3 Oberfläche Kern | Held, Phasenleiste, Motoren, Checkliste, Kacheln, Erklär-Sheets | alle Zustände aus 8.4 über `?fixture=` darstellbar |
| M4 Position und Journal | `localStorage`, „Erledigt"-Ablauf, Export und Import | Handlungssätze mit Beträgen, Backup-Rundreise ohne Verlust |
| M5 Benachrichtigungen | `notify.mjs`, Issues, optional ntfy, Gesundheitsprüfung | Test-Event über `workflow_dispatch` kommt als E-Mail und Push an |
| M6 Verlauf und Zyklus-Uhr | Chart mit Phasenbändern und Tranchen, Zeitstrahl | Chart zeigt 2014 bis heute unter einer Sekunde |
| M7 Härtung | Barrierefreiheit, Grenzfälle, README | Prüfliste 8.5 erfüllt |

Reihenfolge begründet: Erst wenn M2 zeigt, dass die Regeln historisch tragen, lohnt sich die Oberfläche.

Aus dem Cockpit direkt übernehmbar: CSS-Variablen, Karten- und Bottom-Sheet-Stile, der `store`-Helfer mit Fehlerabfang, Export und Import, das Zahlenformat `fmtUSD` und die Muster für „alt"-Markierungen.

---

## 12. Tests

Mit `node:test`, ohne Abhängigkeiten.

| Bereich | Prüft |
|---|---|
| Normierung | Interpolation, Begrenzung an den Rändern, steigende und fallende Anker, Hybrid nimmt das Maximum |
| Perzentil | Randfälle (gleiche Werte, kurze Historie, `pct_basis: "kurz"`) |
| Motoren | Herausrechnen fehlender Indikatoren und Familien, 50-%-Regel je Familie, Abdeckung unter 70 % löst Datenlücke aus |
| Phasenmaschine | nur Vorwärts-Übergänge, Zähler fällt bei verfehlter Woche auf 0, Zähler bleibt bei Datenlücke stehen, relevantes Halving |
| Tranchen | B2 frühestens nach 4 und spätestens nach 12 Wochen, Zusammenlegen von B2 und B3, S-Abstände, Trendbruch verkauft alles Offene |
| Kein Blick in die Zukunft | Woche t mit abgeschnittenen Daten gerechnet ergibt dasselbe wie im vollen Durchlauf |
| Fixpunkte | die Wochen aus 10.4 als Schnappschuss-Tests, nach M2 festgeschrieben |
| Ausgabe | `latest.json`, `events.json` und `state.json` gegen ein Schema (einfacher eigener Prüfer) |

---

## 13. Betrieb und Wartung

| Rhythmus | Was |
|---|---|
| wöchentlich | nichts, die Benachrichtigung kommt von selbst |
| bei einem Signal | Tranche ausführen, „Erledigt" tippen, Issue schliessen |
| jährlich (1. Januar) | Review-Issue abarbeiten: Backup exportieren, Kernposition prüfen, Quellenstatus ansehen |
| nach jedem Zyklus | neuen Zyklus in den Backtest aufnehmen, Schwellen prüfen, gegebenenfalls Konfiguration v2.0 |

**Wenn eine Quelle ausfällt:** Die Pipeline markiert den Wert als alt und nutzt den Fallback aus `sources.json`. Gibt es keinen, wird die Kennzahl herausgerechnet oder aus `manual.json` genommen. Sinkt die Abdeckung unter 70 %, greift die Datenlücke. Es wird nie mit geratenen Werten weitergerechnet.

**Versionierung:** `config/engine.json` hat ein Feld `version`. Die Seite zeigt es in der Fusszeile, jedes Event speichert die Version, mit der es entstand.

---

## 14. Risiken und Grenzen

| Risiko | Gegenmassnahme |
|---|---|
| Der 4-Jahres-Zyklus bricht (ETFs, Institutionen) | Kernposition, relative Schwellen, Gate B und Weg E2, Hinweis „Zyklus-Anomalie" |
| Eine Quelle ändert ihre Rechenweise | Eine-Quelle-Regel, jährlicher Quellencheck |
| Überanpassung an vier Zyklen | Schwellen vorab festgelegt, Einen-Zyklus-auslassen-Prüfung, Einfrieren |
| Signale werden ignoriert | Benachrichtigung, offene Issues als Erinnerung, Journal |
| Frühverkauf in einer Doppelspitze (wie 2021) | Kernposition, bewusst akzeptiert |
| Steuern | wenige Transaktionen. In der Schweiz zählen unter anderem Haltedauer (mindestens 6 Monate) und Handelsvolumen zu den Kriterien für gewerbsmässigen Handel. Einzelfall mit einer Steuerfachperson klären. |
| Datenschutz | keine Positionsdaten im öffentlichen Repo |
| Nutzungsbedingungen der Datenquellen | nur Quellen, deren Bedingungen eine öffentliche, nicht-kommerzielle Anzeige erlauben; Quellenangaben in der Fusszeile; BGeometrics erst nach schriftlicher Zusage (3.4) |

---

## Anhang A: Zyklusdaten (gerundet)

| Zyklus | Halving | Hoch | Tage Halving → Hoch | Tief danach | Tage Hoch → Tief | Rückgang |
|---|---|---|---|---|---|---|
| 1 | 28.11.2012 | 04.12.2013, ~1'150 USD | 371 | 14.01.2015, ~170 USD | 406 | ~−85 % |
| 2 | 09.07.2016 | 17.12.2017, ~19'800 USD | 526 | 15.12.2018, ~3'200 USD | 363 | ~−84 % |
| 3 | 11.05.2020 | 10.11.2021, ~69'000 USD | 548 | 21.11.2022, ~15'500 USD | 376 | ~−77 % |
| 4 | 20.04.2024 | 06.10.2025, ~126'000 USD | 534 | offen; Juni 2026 ~60'000 USD | offen (~8 Monate bis Juni) | bisher ~−52 % |

Tage vom Tief zum nächsten Hoch: 1'068, 1'061, 1'050. MVRV-Z-Score am Hoch ungefähr: 2017 ~9, April 2021 ~7,5, 2025 ~3. Die Pipeline liefert die exakten Werte, diese Tabelle dient nur der Orientierung.

## Anhang B: Texte für die Erklär-Sheets

| ID | Was es misst | Grenzen |
|---|---|---|
| `mvrv_z` | Wie weit der Marktwert aller Coins über ihrem Einstandswert liegt, gemessen in Standardabweichungen. | Die Spitzen sinken von Zyklus zu Zyklus, deshalb auf der Verkaufsseite nur relativ bewertet. |
| `p_rp` | Verhältnis des Preises zum durchschnittlichen Einstandspreis aller Coins. Unter 1 ist der Durchschnittshalter im Verlust. | Wurde 2026 bisher nicht unterschritten. Nicht jedes Tief geht so tief. |
| `p_200w` | Abstand zum Durchschnitt der letzten 200 Wochenschlüsse. | 2022 fiel der Preis rund 20 % darunter. Berührung heisst nicht Tief. |
| `mayer` | Abstand zum 200-Tage-Schnitt. | Reagiert schneller als der 200-Wochen-Schnitt, dafür unruhiger. |
| `supply_loss` | Anteil aller Coins, die unter ihrem Einstandspreis liegen. | Kann Monate im Extrem verharren (2019 und 2022 rund ein halbes Jahr). |
| `reserve_risk` | Verhältnis von Preis zur Überzeugung der Langzeithalter. | Nur relativ zur eigenen Historie aussagekräftig. |
| `fng_fear_weeks` | Wie viele der letzten 8 Wochen im Durchschnitt extreme Angst zeigten. | Daten erst ab 2018. |
| `puell` | Tageserlös der Miner im Verhältnis zum Jahresschnitt. | Die Spitzen fallen nach jedem Halving schwächer aus, deshalb nur auf der Kaufseite. |
| `hash_ribbons` | Ob sich die Hashrate nach einer Miner-Kapitulation erholt. | Reiner Bestätiger, meldet auch mitten im Zyklus. |
| `drawdown` | Wie weit der Preis unter dem Allzeithoch liegt. | Die Rückgänge werden flacher (−85 %, −84 %, −77 %, bisher −52 %). |
| `months_since_ath` | Zeit seit dem letzten Allzeithoch. | Vier Datenpunkte, kein Naturgesetz. |
| `cycle_clock` | Tage seit dem relevanten Halving. | Die Hochs lagen bei 526, 548 und 534 Tagen. Sehr konstant, aber seit den ETFs umstritten. |
| `bmsb_ext` | Wie weit der Preis über dem Trendband (20-Wochen-SMA und 21-Wochen-EMA) liegt. | 2025 fast ohne Überdehnung. |
| `pi_cycle` | Nähe der 111-Tage-Linie zur doppelten 350-Tage-Linie. | Traf 2013, 2017 und April 2021, verfehlte November 2021 und 2025. Nur Bestätiger. |
| `rhodl` | Ob neue, kurzfristige Käufer den Markt von alten Haltern übernehmen. | Nur relativ zur eigenen Historie. |
| `lth_dist` | Wie stark Langzeithalter in den letzten 30 Tagen netto verkauft haben. | Verteilen auch mitten im Bullenmarkt. |
| `fng_4w` | Durchschnittliche Marktstimmung der letzten 4 Wochen. | Stark von kurzfristigen Kursbewegungen getrieben. |
| `funding_30d` | Was gehebelte Käufer im Schnitt an Leerverkäufer zahlen. | Seit den ETFs weniger ausgeprägt. |
| `retail_attention` | Wie oft die Wikipedia-Artikel zu Bitcoin (en und de) aufgerufen werden. | Ersatz für App-Store-Ranglisten, die es nicht kostenlos gibt. 2025 blieb die breite Masse weg. |

## Anhang C: Datenformate

**`data/latest.json`** (gekürzt, Beispielwerte)

```json
{
  "schema": 1,
  "config_version": "1.0",
  "generated_at": "2026-09-07T02:58:11Z",
  "week_id": "2026-09-06",
  "provisional": false,
  "price": { "close": 77050, "source": "bitstamp" },
  "phase": { "id": 1, "name": "Akkumulation", "since": "2026-06-21", "weeks": 11 },
  "lamp": "green",
  "action": { "code": "WAIT_B3", "tranche": null, "text": "Tranchen 1 und 2 ausgelöst. Tranche 3 folgt, sobald das Tief bestätigt ist." },
  "engines": {
    "buy": {
      "score": 73, "coverage": 1.0, "zone": "aktiv",
      "confluence": { "in_zone": 6, "of": 11, "families": 4 },
      "gates": { "A": false, "B": true },
      "families": { "bewertung": 80, "halter_stimmung": 78, "miner": 66, "zeit": 47 }
    },
    "sell": { "score": 8, "coverage": 1.0, "zone": "ruhig" }
  },
  "next_transition": {
    "to": 2, "name": "Tief bestätigt", "counter": 0, "needed": 2,
    "conditions": [
      { "label": "Wochenschluss über Bandoberkante", "value": 77050, "target": 74900, "met": true },
      { "label": "Wochenschluss über STH-Einstand", "value": 77050, "target": 80100, "met": false }
    ]
  },
  "flags": { "unclear": false, "data_gap": false, "reserve_chance": false, "alert": null },
  "cycle_clock": {
    "ath": 126200, "ath_date": "2025-10-06", "days_since_ath": 335,
    "relevant_halving": null, "next_halving_est": "2028-04-14",
    "windows": { "bottom": ["2026-07-06", "2027-02-06"], "top": null }
  },
  "indicators": {
    "mvrv_z": {
      "value": 0.62, "pct4y": 21, "score_buy": 61, "score_sell": 0,
      "state": "near", "trend4w": "up", "source": "bgeometrics",
      "as_of": "2026-09-06", "stale": false, "last_in_zone": "2026-07-12"
    }
  }
}
```

**`data/events.json`** (ein Eintrag)

```json
{
  "id": "2026-07-19:TRANCHE_DUE:B2",
  "week_id": "2026-07-19",
  "type": "TRANCHE_DUE",
  "phase": 1,
  "tranche": "B2",
  "text": "Kauftranche 2 von 3 fällig.",
  "config_version": "1.0",
  "notified_at": "2026-07-20T03:01:40Z"
}
```

**`data/state.json`**

```json
{
  "phase": 1,
  "phase_since": "2026-06-21",
  "cycle_start": "2026-06-21",
  "relevant_halving": null,
  "counter": 0,
  "tranches": { "B1": "2026-06-21", "B2": "2026-07-19", "B3": null },
  "reserve_cooldown_until": null,
  "last_week_id": "2026-09-06"
}
```

**`config/engine.json`** (Ausschnitt)

```json
{
  "version": "1.0",
  "confirm_weeks": 2,
  "bootstrap": { "start_week": "2014-01-05", "start_phase": 4 },
  "phase_override": null,
  "engines": {
    "buy": {
      "families": {
        "bewertung":       { "weight": 50, "members": ["mvrv_z", "p_rp", "p_200w", "mayer"] },
        "halter_stimmung": { "weight": 20, "members": ["supply_loss", "reserve_risk", "fng_fear_weeks"] },
        "miner":           { "weight": 15, "members": ["puell", "hash_ribbons"] },
        "zeit":            { "weight": 15, "members": ["drawdown", "months_since_ath"] }
      },
      "zone_min_score": 60, "confluence": { "indicators": 4, "families": 3 }
    }
  },
  "anchors": {
    "p_rp": { "buy": [[1.8, 0], [1.4, 40], [1.15, 70], [1.0, 90], [0.9, 100]] }
  },
  "gates": {
    "buy_B": { "months_since_ath_min": 6, "drawdown_max": -40, "p_200w_max": 1.05,
               "supply_loss_min": 45, "mvrv_z_pct_max": 15 },
    "sell_E1": { "halving_days_min": 450, "mvrv_z_pct_min": 90, "score_min": 60 },
    "sell_E2": { "halving_days_min": 480, "score_min": 40 }
  },
  "tranches": { "b2_min_weeks": 4, "b2_max_weeks": 12, "s_min_gap_weeks": 4 },
  "freshness_days": { "price": 2, "onchain": 3, "fng": 3, "funding": 3, "wiki": 7, "manual": 30 },
  "onchain_lookback_days": 10
}
```

**`localStorage` im Browser** (nur privat)

| Schlüssel | Inhalt |
|---|---|
| `zy_position` | `{ btc, cash, currency, core_pct, reserve_pct, split_buy, split_sell }` |
| `zy_tranches` | erledigte oder übersprungene Tranchen je Zyklus, mit Datum, Preis, Menge |
| `zy_journal` | eigene Notizen und Entscheidungen |
| `zy_seen_event` | ID des zuletzt gesehenen Events (für die einmalige Lampen-Animation) |
| `zy_dca` | Sparplan-Modul an oder aus, Monatsbetrag |

Export und Import sichern alle Schlüssel mit Präfix `zy_` in eine JSON-Datei. Safari auf iOS löscht Website-Speicher nach längerer Inaktivität, deshalb erinnert der Jahres-Review ans Exportieren.
