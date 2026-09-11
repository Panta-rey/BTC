# Quellen-Check

Erstellt: 2026-09-11 20:13 UTC · Runner: Linux · Node v22.23.2

## Ergebnis je Quelle

| Gruppe | Quelle | Status | HTTP | Daten von | bis | Punkte | Letzter Wert | Hinweis |
|---|---|---|---|---|---|---|---|---|
| Preis | Bitstamp OHLC (Tag) | ✓ | 200 | 2011-08-18 | 2026-09-11 | – | 77'443 |  |
| Preis | Coinbase Exchange Candles | ✓ | 200 | 2025-09-27 | 2026-09-11 | 350 | 77'411 | max. 300 Tage pro Abruf, ältere Daten über start/end |
| Preis | Binance api.binance.com (erwartet: 451) | ✗ | 451 | – | – | – | – | HTTP 451: aus diesem Standort gesperrt (Geo-Blocking) |
| Preis | Binance data-api.binance.vision | ✓ | 200 | – | 2026-09-11 | 3 | 77'473 |  |
| Coin Metrics | PriceUSD – Preis (Referenz) | ✓ | 200 | 2010-07-18 | 2026-09-10 | – | 76'676 |  |
| Coin Metrics | CapMrktCurUSD – Marktkapitalisierung | ✓ | 200 | 2010-07-18 | 2026-09-10 | – | 1.54 Bio. |  |
| Coin Metrics | CapMVRVCur – MVRV-Verhältnis | ✓ | 200 | 2010-07-18 | 2026-09-10 | – | 1.44 |  |
| Coin Metrics | CapRealUSD – Realized Cap | ✗ | 403 | – | – | – | – | API: Requested metric 'CapRealUSD' with frequency '1d' for asset 'btc' is not available with supplied credentials. |
| Coin Metrics | SplyCur – Umlaufmenge | ✓ | 200 | 2009-01-03 | 2026-09-10 | – | 20.08 Mio. |  |
| Coin Metrics | IssTotUSD – Neuemission in USD (für Puell) | ✓ | 200 | 2010-07-18 | 2026-09-10 | – | 32.11 Mio. |  |
| Coin Metrics | HashRate – Hashrate | ✓ | 200 | 2009-01-09 | 2026-09-10 | – | 848.97 Mio. |  |
| Coin Metrics | RevUSD – Miner-Erlös gesamt | ✗ | 403 | – | – | – | – | API: Requested metric 'RevUSD' with frequency '1d' for asset 'btc' is not available with supplied credentials. |
| Netzwerk | mempool.space Hashrate (gesamt) | ✓ | 200 | 2009-01-03 | 2026-09-11 | 6461 | 835942856.14 Bio. |  |
| Netzwerk | mempool.space Blockhöhe | ✓ | 200 | – | 2026-09-11 | – | 966'553 | noch 83'447 Blöcke bis Halving, grob 2028-04 |
| Netzwerk | Blockchain.com Miner-Erlös | ✓ | 200 | 2009-01-17 | 2026-09-10 | 6439 | 35.76 Mio. |  |
| Netzwerk | Blockchain.com Hashrate | ✓ | 200 | 2009-01-03 | 2026-09-10 | 6450 | 848.97 Mio. |  |
| Stimmung | alternative.me Fear & Greed | ✓ | 200 | 2018-02-01 | 2026-09-11 | 3141 | 56.00 | Quellenangabe neben den Daten erwünscht |
| Stimmung | Wikipedia-Aufrufe (en) | ✓ | 200 | 2015-07-01 | 2026-09-10 | 4090 | 2'510 |  |
| Stimmung | Wikipedia-Aufrufe (de) | ✓ | 200 | 2015-07-01 | 2026-09-10 | 4090 | 428.00 |  |
| Funding | Deribit BTC-PERPETUAL (30 T) | ✓ | 200 | 2026-08-12 | 2026-09-11 | 720 | 0.00368 | Wert = Ø Funding 8 h in % |
| Funding | OKX BTC-USDT-SWAP | ✓ | 200 | 2026-08-09 | 2026-09-11 | 100 | 0.00625 | Wert = Ø Funding in %, nur ~3 Monate Historie |
| Funding | Bybit BTCUSDT | ✗ | 403 | – | – | – | – | HTTP 403: Zugriff verweigert |
| BGeometrics | API-Doku (OpenAPI, ohne Token) | ✓ | 200 | – | – | 704 | – | 704 Pfade, 10 von 10 gesuchten Kennzahlen gefunden |
| BGeometrics | Datenabruf mit Token | – | – | – | – | – | – | übersprungen (BGEO_TESTCALLS nicht gesetzt) |

## Was das für die Ampel heisst

| Kennzahl | Quelle nach diesem Check |
|---|---|
| BTC-Tagesschluss | price.bitstamp |
| Preis-Seed vor 2011 | cm.PriceUSD |
| Realized Price | abgeleitet: Preis ÷ cm.CapMVRVCur |
| MVRV-Z-Score | selbst berechnet aus cm.CapMrktCurUSD und cm.CapMVRVCur |
| Puell Multiple | selbst berechnet aus cm.IssTotUSD |
| Hash Ribbons | cm.HashRate |
| Fear & Greed | sent.fng |
| Funding | fund.deribit |
| Wikipedia-Aufmerksamkeit | sent.wiki_en + sent.wiki_de |
| Blockhöhe / Halving | net.mempool_tip |
| STH-Realized-Price | manual.json |
| Angebot im Verlust | ✗ keine freie Quelle – Familie wird herausgerechnet oder manuell |
| Reserve Risk | ✗ keine freie Quelle – Familie wird herausgerechnet oder manuell |
| RHODL-Ratio | ✗ keine freie Quelle – Familie wird herausgerechnet oder manuell |
| Abgabe der Langzeithalter | ✗ keine freie Quelle – Familie wird herausgerechnet oder manuell |

## BGeometrics

Doku gefunden: https://bitcoin-data.com/api/v3/api-docs · Server: https://api.bitcoin-data.com

| Kennzahl | gefundene Pfade |
|---|---|
| mvrv_z | `/v1/sth-mvrv-zscore`, `/v1/sth-mvrv-zscore/{last}`, `/v1/mvrv-zscore`, `/v1/mvrv-zscore/{last}`, `/v1/mvrv-zscore-2yr`, `/v1/mvrv-zscore-2yr/{last}` |
| realized_price | `/v1/realized-price`, `/v1/realized-price/{last}`, `/v1/realized-price-momentum`, `/v1/realized-price-momentum/{last}`, `/v1/realized-price-delta`, `/v1/realized-price-delta/{last}` |
| sth_realized_price | `/v1/sth-realized-price`, `/v1/sth-realized-price/{last}`, `/v1/realized-price-sth`, `/v1/realized-price-sth/{last}`, `/v1/realized-price-sth-90d`, `/v1/realized-price-sth-90d/{last}` |
| supply_profit | `/v1/supply-profit`, `/v1/supply-profit/{last}`, `/v1/supply-profit/csv`, `/v1/supply-profit-sth`, `/v1/supply-profit-sth/{last}`, `/v1/supply-profit-lth` |
| puell | `/v1/puell-multiple`, `/v1/puell-multiple/{last}` |
| hash_ribbons | `/v1/hashribbons`, `/v1/hashribbons/{last}` |
| reserve_risk | `/v1/reserve-risk`, `/v1/reserve-risk/{last}`, `/v1/reserve-risk-adjusted`, `/v1/reserve-risk-adjusted/{last}` |
| rhodl | `/v1/rhodl-ratio`, `/v1/rhodl-ratio/{last}` |
| lth_position | `/v1/lth-net-position-change-usd`, `/v1/lth-net-position-change-usd/{last}`, `/v1/lth-net-position-change-btc`, `/v1/lth-net-position-change-btc/{last}`, `/v1/lth-net-position-change-7d-btc`, `/v1/lth-net-position-change-7d-btc/{last}` |
| funding | `/v1/funding-rate`, `/v1/funding-rate/{last}` |

Hinweis: Die Gratis-Nutzung von BGeometrics ist für persönliche Projekte gedacht. Abrufe von fremden Systemen (GitHub-Runner) und die Anzeige der Daten auf einer öffentlichen Seite gelten laut Nutzungsbedingungen als kommerzielle Weiterverbreitung. Vor dem Einsatz in der Pipeline schriftlich klären.
