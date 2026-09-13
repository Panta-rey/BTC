#!/usr/bin/env node
// Panta Rey · Ampel – Datenabzug von BGeometrics (nur lokal)
//
// WICHTIG: Dieses Script läuft ausschliesslich auf deinem Rechner, nie im GitHub-Runner.
// Die Nutzungsbedingungen (Stand 24.02.2026) werten den Einsatz des Tokens von fremden
// Systemen und die Auslieferung der Daten an Endnutzer als kommerzielle Weiterverbreitung.
// Der Abzug landet in data/private/, das von .gitignore ausgeschlossen ist. Veröffentlicht
// wird nur der Bericht aus scripts/local/compare.mjs, also Kennzahlen über die Daten.
//
// Ablauf:
//   1. BGEOMETRICS_TOKEN=... node scripts/local/fetch-bgeometrics.mjs --probe
//      Sucht den richtigen Server und prüft jeden Kandidatenpfad einmal mit /last.
//      Ein Abruf pro Pfad, kleine Antwort. Ergebnis: data/private/_paths.json
//   2. BGEOMETRICS_TOKEN=... node scripts/local/fetch-bgeometrics.mjs
//      Vollabzug der bestätigten Pfade über /csv. Ein Abruf pro Reihe.
//   3. BGEOMETRICS_TOKEN=... node scripts/local/fetch-bgeometrics.mjs --check
//      Nur die letzten Werte der Gruppe A, zum Abgleich mit den Chart-Ablesungen.
//
// Optionen:
//   --repair            ohne Netz und ohne Token: setzt bei mehrspaltigen Antworten
//                       die richtige Spalte als Hauptwert, rechnet Ableitungen aus
//   --list              Katalog anzeigen, kein Netzwerk
//   --group=A,B         nur diese Gruppen
//   --only=id1,id2      nur diese Kennzahlen
//   --out=data/private  Zielverzeichnis (zweiter Abzug: --out=data/private-2)
//   --rph=180           Abrufe pro Stunde (Advanced erlaubt 200)
//   --force             schon vorhandene Dateien neu holen
//   --server=https://…  Host übersteuern, falls sich die Adresse ändert
//                       (geht auch über BGEOMETRICS_SERVER)
//
// Gruppen:
//   A Pflicht     die fünf fehlenden Kennzahlen, Kern der Frage aus HANDOFF §11
//   B Gegenprobe  prüft unsere eigenen Ableitungen aus Coin Metrics.
//                 Dieser Nutzen überlebt die Kündigung.
//   C Kandidat    könnte die Motoren verbessern. Vor dem Vergleich festlegen,
//                 was getestet wird (SPEC 10.5, Schutz vor Überanpassung).
//   D Kontext     nur zur Einordnung, löst nie etwas aus.

import { get, sleep, HttpError } from "../lib/http.mjs";
import { readJSON, writeJSON } from "../lib/store.mjs";

// ---------------------------------------------------------------- Argumente

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => {
  const eq = argv.find((a) => a.startsWith(`--${n}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const csvArg = (n) => (opt(n) ? opt(n).split(",").map((s) => s.trim()).filter(Boolean) : null);

const MODE = flag("list") ? "list" : flag("repair") ? "repair" : flag("probe") ? "probe" : flag("check") ? "check" : "pull";
const OUT = (opt("out", "data/private") || "data/private").replace(/\/$/, "");
const RPH = Math.max(1, Number(opt("rph", 180)));
const ONLY = csvArg("only");
const GROUPS = csvArg("group")?.map((g) => g.toUpperCase());
const FORCE = flag("force");

// ---------------------------------------------------------------- Katalog
//
// Die Pfade sind Kandidaten. Die Doku ist eine JavaScript-Oberfläche und gibt ihre
// Liste nicht als Text her, deshalb prüft --probe jeden Kandidaten einmal und merkt
// sich den ersten, der antwortet. Bestätigte Pfade stehen zuerst.
//
// field   bevorzugte Wertspalte, falls die Antwort mehrere hat (z. B. OHLC)
// plaus   erwarteter Wertebereich. Liegt der letzte Wert daneben, gibt es eine Warnung.
//         Wichtig bei Reserve Risk: Anbieter normieren um Grössenordnungen anders.

const CATALOG = [
  // ---- A: die fünf fehlenden --------------------------------------------
  { id: "sth_realized_price", g: "A", name: "STH-Realized-Price", plaus: [1, 1e7],
    paths: ["/v1/sth-realized-price", "/v1/realized-price-sth", "/v1/sth-realised-price"] },
  { id: "supply_in_profit", g: "A", name: "Angebot im Gewinn", plaus: [0, 21e6],
    paths: ["/v1/supply-in-profit", "/v1/supply-profit", "/v1/sply-in-profit", "/v1/utxo-in-profit"] },
  { id: "reserve_risk", g: "A", name: "Reserve Risk", plaus: [0.0001, 0.5],
    paths: ["/v1/reserve-risk", "/v1/reserverisk"] },
  { id: "rhodl", g: "A", name: "RHODL-Ratio",
    paths: ["/v1/rhodl-ratio", "/v1/rhodl", "/v1/rhodl-1m"] },
  { id: "lth_net_position", g: "A", name: "LTH-Positionsänderung 30 T (BTC)",
    paths: ["/v1/lth-net-position-change-btc", "/v1/lth-net-position-change-30d", "/v1/lth-net-position-change"] },
  // Gegenstücke, kosten je einen Abruf und helfen beim Einordnen
  { id: "supply_in_loss", g: "A", name: "Angebot im Verlust", plaus: [0, 21e6],
    paths: ["/v1/supply-in-loss", "/v1/supply-loss"] },
  { id: "lth_realized_price", g: "A", name: "LTH-Realized-Price", plaus: [1, 1e7],
    paths: ["/v1/lth-realized-price", "/v1/realized-price-lth"] },
  { id: "lth_net_position_365", g: "A", name: "LTH-Positionsänderung 365 T",
    paths: ["/v1/lth-net-position-change-365d", "/v1/lth-net-position-change-1y"] },
  { id: "sth_net_position", g: "A", name: "STH-Positionsänderung 30 T",
    paths: ["/v1/sth-net-position-change-btc", "/v1/sth-net-position-change-30d"] },

  // ---- B: Gegenprobe unserer Ableitungen --------------------------------
  { id: "price_usd", g: "B", name: "BTC-Preis USD (täglich)", plaus: [0.01, 1e7],
    paths: ["/v1/btc-price", "/v1/price-usd", "/v1/price", "/v1/btc-price-usd"] },
  { id: "ohlc", g: "B", name: "OHLC täglich", field: "close", plaus: [0.01, 1e7],
    paths: ["/v1/ohlc", "/v1/btc-ohlc", "/v1/ohlc-daily"] },
  // Reines Archiv, kein Eingang in die Ampel: Signale werden ausschliesslich auf
  // Wochenschlüssen geprüft und Intraday-Spitzen bewusst ignoriert (SPEC 2.3).
  // Kostet zwei Abrufe, deshalb mitgenommen. Frei auch bei Bitstamp erhältlich.
  { id: "ohlc_4h", g: "B", name: "OHLC 4 Stunden (Archiv)", field: "close", plaus: [0.01, 1e7],
    paths: ["/v1/ohlc-4h", "/v1/ohlc4h", "/v1/btc-ohlc-4h", "/v1/ohlc-4hours"] },
  { id: "realized_price", g: "B", name: "Realized Price", plaus: [1, 1e7],
    paths: ["/v1/realized-price", "/v1/realised-price"] },
  { id: "mvrv_z", g: "B", name: "MVRV-Z-Score", plaus: [-5, 20],
    paths: ["/v1/mvrv-zscore", "/v1/mvrv-z-score", "/v1/mvrv"] },
  { id: "mvrv_ratio", g: "B", name: "MVRV-Verhältnis", plaus: [0, 20],
    paths: ["/v1/mvrv-ratio"] },
  { id: "market_cap", g: "B", name: "Marktkapitalisierung",
    paths: ["/v1/market-cap", "/v1/marketcap", "/v1/cap-market"] },
  { id: "realized_cap", g: "B", name: "Realized Cap",
    paths: ["/v1/realized-cap", "/v1/realised-cap", "/v1/cap-realized"] },
  { id: "puell", g: "B", name: "Puell Multiple", plaus: [0, 20],
    paths: ["/v1/puell-multiple", "/v1/puell"] },
  { id: "btc_issued_usd", g: "B", name: "Neuemission in USD",
    paths: ["/v1/btc-issued-usd", "/v1/issuance-usd", "/v1/btc-issued"] },
  { id: "miner_revenue_usd", g: "B", name: "Miner-Erlös gesamt (inkl. Gebühren)",
    paths: ["/v1/miner-revenue", "/v1/miner-revenue-usd"] },
  { id: "hashrate", g: "B", name: "Hashrate",
    paths: ["/v1/hashrate", "/v1/hash-rate"] },
  { id: "hashribbons", g: "B", name: "Hash Ribbons",
    paths: ["/v1/hashribbons", "/v1/hash-ribbons"] },
  { id: "mayer", g: "B", name: "Mayer Multiple", plaus: [0, 10],
    paths: ["/v1/mayer-multiple", "/v1/mayer"] },
  { id: "sma_200w", g: "B", name: "200-Wochen-Schnitt", plaus: [0.01, 1e7],
    paths: ["/v1/200w-ma", "/v1/sma-200w", "/v1/200-week-ma", "/v1/ma-200w"] },
  { id: "funding", g: "B", name: "Funding Rate",
    paths: ["/v1/funding-rate", "/v1/funding"] },
  { id: "fear_greed", g: "B", name: "Fear & Greed", plaus: [0, 100],
    paths: ["/v1/fear-greed", "/v1/fear-and-greed", "/v1/feargreed"] },
  { id: "wikipedia", g: "B", name: "Wikipedia-Aufrufe",
    paths: ["/v1/wikipedia-pageviews", "/v1/wikipedia", "/v1/pageviews"] },
  { id: "pi_cycle", g: "B", name: "Pi Cycle",
    paths: ["/v1/pi-cycle", "/v1/picycle"] },

  // ---- C: Kandidaten für die Motoren ------------------------------------
  // Bewertung / Relative Bewertung
  { id: "aviv", g: "C", name: "AVIV-Ratio", fam: "Bewertung", paths: ["/v1/aviv", "/v1/aviv-ratio"] },
  { id: "nupl", g: "C", name: "NUPL", fam: "Bewertung", plaus: [-1, 1], paths: ["/v1/nupl"] },
  { id: "true_market_mean", g: "C", name: "True Market Mean", fam: "Bewertung",
    paths: ["/v1/true-market-mean", "/v1/truemarketmean", "/v1/cointime-true-market-mean"] },
  { id: "thermocap", g: "C", name: "Thermocap-Ratio", fam: "Bewertung",
    paths: ["/v1/thermocap-ratio", "/v1/thermo-cap", "/v1/thermocap"] },
  { id: "nvt_z", g: "C", name: "NVT-Z-Score", fam: "Bewertung",
    paths: ["/v1/nvt-zscore", "/v1/nvt-z-score", "/v1/nvts"] },
  { id: "power_law_osc", g: "C", name: "Power-Law-Oszillator", fam: "Bewertung",
    paths: ["/v1/power-law-oscillator", "/v1/powerlaw-oscillator"] },
  { id: "price_temperature", g: "C", name: "Price Temperature (Z gegen 4J-SMA)", fam: "Bewertung",
    paths: ["/v1/price-temperature", "/v1/btc-temperature"] },
  { id: "mvrv_z_2yr", g: "C", name: "MVRV-Z rollierend 2 Jahre", fam: "Bewertung",
    paths: ["/v1/mvrv-zscore-2yr", "/v1/mvrv-z-2yr-rolling"] },
  { id: "realized_mayer", g: "C", name: "Realized Mayer Multiple", fam: "Bewertung",
    paths: ["/v1/realized-mayer-multiple", "/v1/realized-mayer"] },
  { id: "golden_ratio", g: "C", name: "Golden Ratio Multiplier", fam: "Bewertung",
    paths: ["/v1/golden-ratio-multiplier", "/v1/golden-ratio"] },
  // Halter & Stimmung / Halterverhalten
  { id: "sopr", g: "C", name: "SOPR", fam: "Halter", paths: ["/v1/sopr"] },
  { id: "sopr_lth", g: "C", name: "SOPR LTH", fam: "Halter", paths: ["/v1/lth-sopr", "/v1/sopr-lth"] },
  { id: "sopr_sth", g: "C", name: "SOPR STH", fam: "Halter", paths: ["/v1/sth-sopr", "/v1/sopr-sth"] },
  { id: "liveliness", g: "C", name: "Liveliness", fam: "Halter", paths: ["/v1/liveliness"] },
  { id: "vdd", g: "C", name: "VDD Multiple", fam: "Halter", paths: ["/v1/vdd", "/v1/vdd-multiple"] },
  { id: "cdd_90dma", g: "C", name: "CDD 90dma", fam: "Halter",
    paths: ["/v1/cdd-90dma", "/v1/cdd-adjusted-90dma", "/v1/cdd"] },
  { id: "ats", g: "C", name: "Accumulation Trend Score", fam: "Halter", plaus: [0, 1],
    paths: ["/v1/accumulation-trend-score", "/v1/ats"] },
  { id: "illiquid_supply", g: "C", name: "Illiquid Supply", fam: "Halter",
    paths: ["/v1/illiquid-supply"] },
  { id: "ancient_supply", g: "C", name: "Ancient Supply (10 J+)", fam: "Halter",
    paths: ["/v1/ancient-supply"] },
  { id: "supply_shock", g: "C", name: "Supply Shock Ratio", fam: "Halter",
    paths: ["/v1/supply-shock-ratio", "/v1/supply-shock"] },
  { id: "hodler_npc_30", g: "C", name: "Hodler Net Position Change 30 T", fam: "Halter",
    paths: ["/v1/hodler-net-position-change-30d", "/v1/hodler-net-position-change"] },
  { id: "rcap_npc", g: "C", name: "Realized Cap Net Position Change", fam: "Halter",
    paths: ["/v1/realized-cap-net-position-change", "/v1/rcap-net-position-change"] },
  { id: "mvrv_lth", g: "C", name: "MVRV LTH", fam: "Halter", paths: ["/v1/lth-mvrv", "/v1/mvrv-lth"] },
  { id: "mvrv_sth", g: "C", name: "MVRV STH", fam: "Halter", paths: ["/v1/sth-mvrv", "/v1/mvrv-sth"] },
  // Miner
  { id: "mpi", g: "C", name: "Miners' Position Index", fam: "Miner",
    paths: ["/v1/mpi", "/v1/miners-position-index"] },
  { id: "miner_reserve", g: "C", name: "Miner Reserve (BTC)", fam: "Miner",
    paths: ["/v1/miner-reserve"] },
  { id: "miner_net_flow", g: "C", name: "Miner Net Flow (BTC)", fam: "Miner",
    paths: ["/v1/miner-net-flow"] },
  { id: "hashprice", g: "C", name: "Hashprice", fam: "Miner", paths: ["/v1/hashprice"] },
  // Euphorie
  { id: "open_interest", g: "C", name: "Open Interest Futures", fam: "Euphorie",
    paths: ["/v1/open-interest", "/v1/open-interest-futures"] },
  { id: "basis", g: "C", name: "Futures-Basis", fam: "Euphorie", paths: ["/v1/basis", "/v1/futures-basis"] },
  { id: "coinbase_premium", g: "C", name: "Coinbase Premium", fam: "Euphorie",
    paths: ["/v1/coinbase-premium"] },
  { id: "google_trends", g: "C", name: "Google Trends", fam: "Euphorie", plaus: [0, 100],
    paths: ["/v1/google-trends", "/v1/googletrends"] },
  { id: "ssr", g: "C", name: "Stablecoin Supply Ratio", fam: "Euphorie",
    paths: ["/v1/ssr", "/v1/stablecoin-supply-ratio"] },
  { id: "exchange_netflow", g: "C", name: "Exchange Netflow (BTC)", fam: "Euphorie",
    paths: ["/v1/exchange-netflow-btc"] },
  { id: "exchange_reserve", g: "C", name: "Exchange Reserve (BTC)", fam: "Euphorie",
    paths: ["/v1/exchange-reserve-btc"] },
  // Zeit & Trend
  { id: "profitable_days", g: "C", name: "Profitable Days", fam: "Zeit",
    paths: ["/v1/profitable-days"] },
  { id: "ath_stats", g: "C", name: "ATH-Statistik (Tage seit, % unter)", fam: "Zeit",
    paths: ["/v1/ath-stats", "/v1/ath"] },
  { id: "halving_progress", g: "C", name: "Halving-Fortschritt", fam: "Zeit",
    paths: ["/v1/halving-progress", "/v1/halving"] },
  // Fertige Composites: ansehen, nie einbauen. Blackbox eines Anbieters, den wir
  // nach der Kündigung nicht mehr haben.
  { id: "cycle_extreme", g: "C", name: "Cycle Extreme (Composite)", fam: "Composite",
    paths: ["/v1/cycle-extreme"] },
  { id: "regime_score", g: "C", name: "Regime Score (Composite)", fam: "Composite",
    paths: ["/v1/regime-score", "/v1/bitcoin-regime-score"] },
  { id: "macro_index", g: "C", name: "Bitcoin Macro Index (Composite)", fam: "Composite",
    paths: ["/v1/macro-index", "/v1/bitcoin-macro-index"] },
  { id: "macro_risk_index", g: "C", name: "Macro Risk Index (Composite)", fam: "Composite",
    paths: ["/v1/macro-risk-index"] },
  { id: "sth_risk_index", g: "C", name: "STH Risk Index (Composite)", fam: "Composite",
    paths: ["/v1/sth-risk-index"] },
  { id: "bgeometrics_index", g: "C", name: "BGeometrics Index (Composite)", fam: "Composite",
    paths: ["/v1/bgeometrics-index"] },

  // ---- D: Kontext -------------------------------------------------------
  { id: "etf_btc", g: "D", name: "ETF-Bestand BTC", paths: ["/v1/etf-btc", "/v1/etf-total-balance", "/v1/etf"] },
  { id: "m2global", g: "D", name: "M2 global", paths: ["/v1/m2global"] },
  { id: "m2_bank", g: "D", name: "M2 Zentralbanken", paths: ["/v1/m2-bank"] },
  { id: "stablecoin_supply", g: "D", name: "Stablecoin-Angebot", paths: ["/v1/stablecoin-supply"] },
  { id: "dxy", g: "D", name: "DXY", paths: ["/v1/dxy"] },
  { id: "vix", g: "D", name: "VIX", paths: ["/v1/vix"] },
  { id: "yield_10y", g: "D", name: "Rendite 10 Jahre", paths: ["/v1/yield-10y", "/v1/yield10y"] },
];

// Server-Kandidaten. Die Doku nennt api.bgeometrics.com, die Tarifseite bitcoin-data.com.
// Mit --server=… oder BGEOMETRICS_SERVER=… übersteuerbar, falls sich der Host ändert.
const SERVERS = (opt("server") ?? process.env.BGEOMETRICS_SERVER)
  ? [(opt("server") ?? process.env.BGEOMETRICS_SERVER).replace(/\/$/, "")]
  : ["https://api.bgeometrics.com", "https://bitcoin-data.com", "https://api.bitcoin-data.com"];

// ---------------------------------------------------------------- Auswahl

let auswahl = CATALOG;
if (GROUPS) auswahl = auswahl.filter((m) => GROUPS.includes(m.g));
if (ONLY) auswahl = auswahl.filter((m) => ONLY.includes(m.id));
if (MODE === "check") auswahl = CATALOG.filter((m) => m.g === "A");

if (MODE === "list") {
  const proGruppe = {};
  for (const m of CATALOG) (proGruppe[m.g] ??= []).push(m);
  const titel = { A: "Pflicht", B: "Gegenprobe", C: "Kandidat", D: "Kontext" };
  for (const [g, ms] of Object.entries(proGruppe)) {
    console.log(`\n${g} · ${titel[g]} (${ms.length})`);
    for (const m of ms) console.log(`  ${m.id.padEnd(22)} ${m.name}${m.fam ? `  [${m.fam}]` : ""}`);
  }
  console.log("\nAbrufbudget (Advanced: 200 pro Stunde, 300 pro Tag)");
  console.log("| Gruppe | Reihen | Probe höchstens | Abzug |");
  for (const [g, ms] of Object.entries(proGruppe)) {
    const p = ms.reduce((s, m) => s + m.paths.length, 0);
    console.log(`| ${g} · ${titel[g].padEnd(10)} | ${String(ms.length).padStart(3)} | ${String(p).padStart(3)} | ${String(ms.length).padStart(3)} |`);
  }
  const pfade = CATALOG.reduce((s, m) => s + m.paths.length, 0);
  console.log(`| gesamt       | ${String(CATALOG.length).padStart(3)} | ${String(pfade).padStart(3)} | ${String(CATALOG.length).padStart(3)} |`);
  console.log("\nDie Probe trifft meist beim ersten Kandidaten, real also deutlich weniger.");
  console.log("Trotzdem sicherer über zwei Tage: erst --group=A,B, am nächsten Tag --group=C,D.");
  process.exit(0);
}

// ---------------------------------------------------------------- Token und Bremse

const TOKEN = process.env.BGEOMETRICS_TOKEN;
if (!TOKEN && MODE !== "repair") {
  console.error("BGEOMETRICS_TOKEN fehlt.\nBeispiel: BGEOMETRICS_TOKEN=dein_token node scripts/local/fetch-bgeometrics.mjs --probe");
  process.exit(1);
}

const GAP_MS = Math.ceil(3_600_000 / RPH);
let letzterAbruf = 0;
let abrufe = 0;

async function abruf(url, { text = false } = {}) {
  const warten = letzterAbruf + GAP_MS - Date.now();
  if (warten > 0) await sleep(warten);
  letzterAbruf = Date.now();
  abrufe++;
  try {
    return await get(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: text ? "text/csv" : "application/json" },
      text, retries: 1, timeout: 60_000,
    });
  } catch (e) {
    // 429 heisst: Stundenfenster voll. Einmal lange warten, dann ein letzter Versuch.
    if (e instanceof HttpError && e.status === 429) {
      console.log("   429, Stundenlimit erreicht. 5 Minuten Pause.");
      await sleep(300_000);
      letzterAbruf = Date.now();
      abrufe++;
      return get(url, { headers: { Authorization: `Bearer ${TOKEN}` }, text, retries: 1, timeout: 60_000 });
    }
    throw e;
  }
}

// ---------------------------------------------------------------- Antworten lesen

const DATUM = /^(d|date|day|time|timestamp|dt|fecha)$/i;
const IGNORE = /^(unix|unixts|id|ts_unix)$/i;

function istDatum(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}
function zuISO(v) {
  if (typeof v === "number") return new Date(v < 1e11 ? v * 1000 : v).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function ausJSON(body, feld) {
  let arr = Array.isArray(body) ? body : Object.values(body || {}).find(Array.isArray);
  // Manche Endpunkte antworten mit einem einzelnen Objekt, vor allem bei /last.
  if (!arr && body && typeof body === "object" && Object.keys(body).length) arr = [body];
  if (!Array.isArray(arr) || !arr.length) return null;
  const keys = Object.keys(arr[0]);
  const dKey = keys.find((k) => DATUM.test(k)) ?? keys.find((k) => istDatum(arr[0][k]));
  if (!dKey) return null;
  const kandidaten = keys.filter((k) => k !== dKey && !IGNORE.test(k) &&
    (typeof arr[0][k] === "number" || (typeof arr[0][k] === "string" && arr[0][k] !== "" && !Number.isNaN(Number(arr[0][k])))));
  if (!kandidaten.length) return null;
  // Alle Zahlenspalten behalten. Eine einzelne zu raten ging schief:
  // /v1/200-week-ma liefert Preis und Schnitt nebeneinander.
  const columns = {};
  for (const k of kandidaten) {
    const reihe = arr
      .map((r) => [zuISO(r[dKey]), Number(r[k])])
      .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v))
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (reihe.length) columns[k] = reihe;
  }
  const vKey = waehleSpalte(Object.keys(columns), feld);
  if (!vKey) return null;
  return { values: columns[vKey], valueKey: vKey, dateKey: dKey, columns };
}

// Welche Spalte gilt als Hauptwert: erst der Wunsch aus dem Katalog, dann "close", sonst die erste.
function waehleSpalte(namen, feld) {
  if (!namen.length) return null;
  const klein = namen.map((n) => n.toLowerCase().replace(/[_\s-]/g, ""));
  const suche = (w) => { const i = klein.indexOf(w.toLowerCase().replace(/[_\s-]/g, "")); return i < 0 ? null : namen[i]; };
  return (feld && suche(feld)) ?? suche("close") ?? namen[0];
}

function ausCSV(text, feld) {
  const zeilen = String(text).trim().split(/\r?\n/);
  if (zeilen.length < 2) return null;
  const teil = (z) => z.split(/[,;]/).map((s) => s.trim().replace(/^"|"$/g, ""));
  const kopf = teil(zeilen[0]);
  const kopfKlein = kopf.map((h) => h.toLowerCase());
  let di = kopfKlein.findIndex((h) => DATUM.test(h));
  if (di < 0) di = teil(zeilen[1]).findIndex(istDatum);
  if (di < 0) return null;
  const erste = teil(zeilen[1]);
  const kandidaten = kopf
    .map((h, i) => i)
    .filter((i) => i !== di && !IGNORE.test(kopfKlein[i]) && erste[i] !== "" && !Number.isNaN(Number(erste[i])));
  if (!kandidaten.length) return null;
  const columns = {};
  for (const i of kandidaten) columns[kopf[i]] = [];
  for (const z of zeilen.slice(1)) {
    const c = teil(z);
    const d = zuISO(c[di]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    for (const i of kandidaten) {
      const v = Number(c[i]);
      if (Number.isFinite(v)) columns[kopf[i]].push([d, v]);
    }
  }
  for (const k of Object.keys(columns)) {
    if (!columns[k].length) delete columns[k];
    else columns[k].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  const vKey = waehleSpalte(Object.keys(columns), feld);
  if (!vKey) return null;
  return { values: columns[vKey], valueKey: vKey, dateKey: kopf[di] ?? "date", columns };
}

// ---------------------------------------------------------------- Probe

async function serverFinden() {
  const anker = ["/v1/hashrate", "/v1/mvrv", "/v1/btc-price"];
  for (const s of SERVERS) {
    for (const p of anker) {
      try {
        await abruf(`${s}${p}/last`);
        console.log(`Server: ${s}  (bestätigt über ${p}/last)`);
        return s;
      } catch (e) {
        if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
          console.error(`\n${s} antwortet mit HTTP ${e.status}. Token oder Tarif prüfen.`);
          process.exit(1);
        }
        if (e instanceof HttpError && e.status === 404) continue; // Host stimmt, Pfad nicht
      }
    }
  }
  console.error("Kein Server hat geantwortet. Netzwerk oder Servernamen prüfen.");
  process.exit(1);
}

async function probe() {
  const server = await serverFinden();
  // Bestehende Landkarte übernehmen. Ein Lauf mit --only oder --group darf die
  // Pfade der übrigen Kennzahlen nicht löschen: Sie wurden teuer erkauft.
  const vorher = await readJSON(`${OUT}/_paths.json`, null);
  const gefunden = { ...(vorher?.gefunden ?? {}) };
  const offenAlt = new Set(vorher?.offen ?? []);
  const gesperrtAlt = new Set(vorher?.gesperrt ?? []);
  const geprueft = new Set(auswahl.map((m) => m.id));
  const offen = [];
  const gesperrt = [];
  if (vorher) console.log(`Bestehende Landkarte: ${Object.keys(gefunden).length} Pfade, wird ergänzt.`);
  console.log(`\nPrüfe ${auswahl.length} Kennzahlen mit /last, höchstens ${auswahl.reduce((s, m) => s + m.paths.length, 0)} Abrufe.`);
  console.log(`Bremse: ${RPH} Abrufe pro Stunde, also ${(GAP_MS / 1000).toFixed(0)} s Abstand.\n`);

  for (const m of auswahl) {
    let treffer = null;
    for (const p of m.paths) {
      try {
        const body = await abruf(`${server}${p}/last`);
        const leer = body == null || (Array.isArray(body) && !body.length) ||
          (typeof body === "object" && !Array.isArray(body) && !Object.keys(body).length);
        if (leer) continue;
        treffer = { path: p, probe: body };
        break;
      } catch (e) {
        if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
          console.log(`⚠ ${m.id.padEnd(22)} HTTP ${e.status} bei ${p} (Tarif deckt diese Kennzahl nicht)`);
          treffer = { path: p, gesperrt: e.status };
          break;
        }
        // 404 und alles andere: nächster Kandidat
      }
    }
    if (treffer && !treffer.gesperrt) {
      gefunden[m.id] = { path: treffer.path, field: m.field ?? null, plaus: m.plaus ?? null, group: m.g, name: m.name };
      const s = ausJSON(treffer.probe, m.field);
      const letzter = s?.values.at(-1);
      console.log(`✓ ${m.id.padEnd(22)} ${treffer.path.padEnd(36)} ${letzter ? `${letzter[0]}  ${letzter[1]}` : "Form unklar, beim Abzug prüfen"}`);
      if (letzter && m.plaus && (letzter[1] < m.plaus[0] || letzter[1] > m.plaus[1])) {
        console.log(`   ⚠ Skala: ${letzter[1]} liegt ausserhalb von ${m.plaus[0]} bis ${m.plaus[1]}. Vor dem Einsatz klären.`);
      }
    } else if (treffer?.gesperrt) {
      gesperrt.push(m.id);
    } else {
      offen.push(m.id);
      console.log(`✗ ${m.id.padEnd(22)} kein Pfad gefunden (${m.paths.join(", ")})`);
    }
  }

  // Was in diesem Lauf nicht geprüft wurde, behält seinen bisherigen Zustand.
  const offenGesamt = [...new Set([...offen, ...[...offenAlt].filter((id) => !geprueft.has(id))])].sort();
  const gesperrtGesamt = [...new Set([...gesperrt, ...[...gesperrtAlt].filter((id) => !geprueft.has(id))])].sort();

  await writeJSON(`${OUT}/_paths.json`, {
    geprueft_am: new Date().toISOString(), server, abrufe,
    zuletzt_geprueft: [...geprueft].sort(),
    gefunden, offen: offenGesamt, gesperrt: gesperrtGesamt,
  }, { pretty: true });

  const neu = Object.keys(gefunden).filter((id) => geprueft.has(id)).length;
  console.log(`\n${neu} von ${auswahl.length} geprüften Pfaden bestätigt, Landkarte umfasst jetzt ${Object.keys(gefunden).length}. ${abrufe} Abrufe verbraucht.`);
  if (gesperrt.length) console.log(`Vom Tarif nicht gedeckt: ${gesperrt.join(", ")}`);
  if (offen.length) {
    console.log(`Offen: ${offen.join(", ")}`);
    console.log("Die richtigen Pfade stehen in der Doku unter api.bgeometrics.com/scalar.html.");
    console.log("Dort nachschlagen, oben im Katalog eintragen, dann --probe --only=<id> nachziehen.");
  }
  console.log(`\nGeschrieben: ${OUT}/_paths.json\nWeiter mit:  node scripts/local/fetch-bgeometrics.mjs`);
}

// ---------------------------------------------------------------- Vollabzug

async function pull() {
  const pfade = await readJSON(`${OUT}/_paths.json`, null);
  if (!pfade?.gefunden) {
    console.error(`${OUT}/_paths.json fehlt. Zuerst --probe ausführen.`);
    process.exit(1);
  }
  const server = pfade.server;
  const liste = auswahl.filter((m) => pfade.gefunden[m.id]);
  const fehlend = auswahl.filter((m) => !pfade.gefunden[m.id]).map((m) => m.id);

  console.log(`Abzug von ${server}\nZiel: ${OUT}/ (nicht im Repo)`);
  console.log(`${liste.length} Reihen, etwa ${((liste.length * GAP_MS) / 60000).toFixed(0)} Minuten.\n`);
  if (fehlend.length) console.log(`Ohne bestätigten Pfad, übersprungen: ${fehlend.join(", ")}\n`);

  const summary = [];
  let csvOk = 0, csvFehl = 0; // spart Abrufe, falls der Server gar kein CSV liefert
  for (const m of liste) {
    const p = pfade.gefunden[m.id].path;
    const ziel = `${OUT}/${m.id}.json`;
    if (!FORCE && (await readJSON(ziel, null))) {
      console.log(`· ${m.id.padEnd(22)} schon vorhanden, übersprungen`);
      continue;
    }
    let s = null, form = null;
    try {
      // CSV zuerst: eine Zeile je Tag, kleiner und eindeutiger als JSON.
      // Scheitert CSV dreimal ohne einen einzigen Erfolg, wird es nicht mehr versucht.
      if (csvOk > 0 || csvFehl < 3) {
        try {
          const text = await abruf(`${server}${p}/csv`, { text: true });
          s = ausCSV(text, m.field);
          if (s) { form = "csv"; csvOk++; } else csvFehl++;
        } catch { csvFehl++; }
      }
      if (!s) {
        const body = await abruf(`${server}${p}`);
        s = ausJSON(body, m.field);
        form = "json";
      }
      if (!s) throw new Error("Antwort unerwartet aufgebaut");

      await writeJSON(ziel, {
        id: m.id, name: m.name, source: "BGeometrics", path: p, group: m.g, format: form,
        value_key: s.valueKey, date_key: s.dateKey,
        columns: Object.keys(s.columns ?? {}),
        fetched_at: new Date().toISOString(),
        values: s.values,
        series: s.columns ?? { [s.valueKey]: s.values },
      });

      const von = s.values[0], bis = s.values.at(-1);
      const jahre = ((Date.parse(bis[0]) - Date.parse(von[0])) / 3.156e10).toFixed(1);
      summary.push({ id: m.id, ok: true, n: s.values.length, von: von[0], bis: bis[0], letzter: bis[1], gruppe: m.g,
                     spalten: Object.keys(s.columns ?? {}) });
      console.log(`✓ ${m.id.padEnd(22)} ${String(s.values.length).padStart(6)} Punkte  ${von[0]} → ${bis[0]}  (${jahre} J, Feld "${s.valueKey}")`);
      const weitere = Object.keys(s.columns ?? {}).filter((k) => k !== s.valueKey);
      if (weitere.length) console.log(`   auch dabei: ${weitere.join(", ")}`);

      if (m.plaus && (bis[1] < m.plaus[0] || bis[1] > m.plaus[1])) {
        console.log(`   ⚠ Skala: letzter Wert ${bis[1]} liegt ausserhalb von ${m.plaus[0]} bis ${m.plaus[1]}.`);
      }
      if (Date.parse(von[0]) > Date.parse("2022-12-31")) {
        console.log(`   ⚠ Historie beginnt erst ${von[0]}. Sieht nach der 4-Jahres-Grenze aus, nicht nach vollem Zugang.`);
      }
    } catch (e) {
      summary.push({ id: m.id, ok: false, fehler: String(e.message || e), gruppe: m.g });
      console.log(`✗ ${m.id.padEnd(22)} ${e.message}`);
    }
  }

  await ableitungen();

  const alt = await readJSON(`${OUT}/_index.json`, null);
  await writeJSON(`${OUT}/_index.json`, {
    fetched_at: new Date().toISOString(), server, abrufe,
    metrics: [...(alt?.metrics ?? []).filter((x) => !summary.some((y) => y.id === x.id)), ...summary],
  }, { pretty: true });

  const ok = summary.filter((x) => x.ok).length;
  console.log(`\n${ok} von ${summary.length} Reihen geholt, ${abrufe} Abrufe verbraucht.`);
  console.log("Weiter mit:  node scripts/local/compare.mjs");
}

// ---------------------------------------------------------------- Reparatur
//
// Viele Endpunkte antworten mehrspaltig, und die erste Spalte ist fast immer
// priceUsd. Der Abzug hat deshalb beim ersten Mal den Preis als Hauptwert
// eingetragen statt der Kennzahl. Alle Spalten liegen aber in der Datei, also
// lässt sich das ohne neuen Abruf geradeziehen.
//
// Die Namen stammen aus dem echten Abzug vom 13.09.2026.

const SPALTE = {
  sma_200w: "ma200w",                 // stand auf priceUsd
  power_law_osc: "oscillator",
  price_temperature: "temperature",
  realized_mayer: "realizedMayerMultiple",
  ats: "ats",                         // stand auf lthScore
  ancient_supply: "ancientSupplyPct",
  profitable_days: "profitableDays365d",
  ath_stats: "pctBelowAth",
  halving_progress: "progressPct",
  cycle_extreme: "compositeScore",
  macro_index: "macroScore",
  macro_risk_index: "macroRiskIndex",
  sth_risk_index: "sthRiskIndex",
};

// Kennzahlen, die sich erst aus zwei Spalten ergeben.
const ABLEITUNG = [
  { id: "pi_cycle_ratio", aus: "pi_cycle", name: "Pi-Cycle-Nähe",
    formel: "piSma111 / piSma350x2", zaehler: "piSma111", nenner: "piSma350x2" },
  { id: "hashribbons_ratio", aus: "hashribbons", name: "Hash Ribbons (30T / 60T)",
    formel: "sma30 / sma60", zaehler: "sma30", nenner: "sma60" },
];

// Reihen, die unter ihrem Pfad etwas anderes liefern, als der Name verspricht.
const UNBRAUCHBAR = {
  mvrv_z_2yr: "liefert nur marketCap und realizedCap, keinen rollierenden Z-Wert",
  golden_ratio: "liefert nur priceUsd, kein Verhältnis",
};

async function repair() {
  console.log("Reparatur der Hauptspalten. Ohne Netzwerk, ohne Token.\n");
  let geaendert = 0;

  for (const [id, spalte] of Object.entries(SPALTE)) {
    const datei = `${OUT}/${id}.json`;
    const j = await readJSON(datei, null);
    if (!j) { console.log(`– ${id.padEnd(22)} nicht abgezogen`); continue; }
    if (!j.series?.[spalte]) {
      console.log(`✗ ${id.padEnd(22)} Spalte "${spalte}" fehlt. Vorhanden: ${Object.keys(j.series ?? {}).join(", ")}`);
      continue;
    }
    if (j.value_key === spalte) { console.log(`· ${id.padEnd(22)} war schon richtig`); continue; }
    const alt = j.value_key;
    j.values = j.series[spalte];
    j.value_key = spalte;
    j.repariert_am = new Date().toISOString();
    await writeJSON(datei, j);
    const letzter = j.values.at(-1);
    console.log(`✓ ${id.padEnd(22)} ${alt} → ${spalte}   letzter Wert ${letzter[1]}  (${letzter[0]})`);
    geaendert++;
  }

  console.log("");
  for (const a of ABLEITUNG) {
    const j = await readJSON(`${OUT}/${a.aus}.json`, null);
    if (!j?.series?.[a.zaehler] || !j?.series?.[a.nenner]) {
      console.log(`– ${a.id.padEnd(22)} ${a.aus} fehlt oder hat die nötigen Spalten nicht`);
      continue;
    }
    const nenner = new Map(j.series[a.nenner]);
    const werte = [];
    for (const [d, z] of j.series[a.zaehler]) {
      const n = nenner.get(d);
      if (n != null && n !== 0) werte.push([d, z / n]);
    }
    if (!werte.length) { console.log(`– ${a.id.padEnd(22)} keine gemeinsamen Tage`); continue; }
    await writeJSON(`${OUT}/${a.id}.json`, {
      id: a.id, name: a.name, source: "BGeometrics (abgeleitet)", herkunft: `${a.aus}: ${a.formel}`,
      value_key: "ratio", date_key: "d", fetched_at: new Date().toISOString(), values: werte,
    });
    const letzter = werte.at(-1);
    console.log(`↳ ${a.id.padEnd(22)} ${werte.length} Punkte  ${werte[0][0]} → ${letzter[0]}   letzter Wert ${letzter[1].toFixed(4)}`);
    geaendert++;
  }

  await ableitungen();

  const offen = [];
  for (const [id, grund] of Object.entries(UNBRAUCHBAR)) {
    if (await readJSON(`${OUT}/${id}.json`, null)) offen.push(`${id}: ${grund}`);
  }
  if (offen.length) {
    console.log("\nNicht verwendbar, obwohl heruntergeladen:");
    for (const z of offen) console.log(`  ${z}`);
  }

  console.log(`\n${geaendert} Reihen angepasst. Der Abzug ist damit vollständig.`);
}

// ---------------------------------------------------------------- Ableitungen
//
// BGeometrics liefert das Angebot im Gewinn und im Verlust als Menge in Bitcoin,
// die Engine erwartet Prozent (SPEC 4.1: supply_loss = 100 − Supply in Profit).
// Beides zusammen ergibt das Umlaufangebot, daraus lässt sich der Anteil rechnen.
// Kein zusätzlicher Abruf, reine Rechnung aus dem, was schon da ist.

async function ableitungen() {
  const gewinn = await readJSON(`${OUT}/supply_in_profit.json`, null);
  const verlust = await readJSON(`${OUT}/supply_in_loss.json`, null);
  if (!gewinn?.values || !verlust?.values) return;
  if (Math.max(...gewinn.values.slice(-10).map(([, v]) => v)) <= 100) return; // schon Prozent

  const mapV = new Map(verlust.values);
  const pct = [];
  for (const [d, g] of gewinn.values) {
    const v = mapV.get(d);
    if (v == null) continue;
    const summe = g + v;
    if (summe > 0) pct.push([d, (g / summe) * 100]);
  }
  if (!pct.length) return;

  await writeJSON(`${OUT}/supply_in_profit_pct.json`, {
    id: "supply_in_profit_pct", name: "Angebot im Gewinn (%)", source: "BGeometrics (abgeleitet)",
    herkunft: "supply_in_profit / (supply_in_profit + supply_in_loss) × 100",
    group: "A", value_key: "pct", date_key: "d",
    fetched_at: new Date().toISOString(), values: pct,
  });
  const letzter = pct.at(-1);
  console.log(`\n↳ supply_in_profit_pct   ${pct.length} Punkte  ${pct[0][0]} → ${letzter[0]}  (aus Menge in BTC gerechnet)`);
  console.log(`   letzter Wert: ${letzter[1].toFixed(1)} % im Gewinn, also ${(100 - letzter[1]).toFixed(1)} % im Verlust`);
  if (letzter[1] < 0 || letzter[1] > 100) console.log("   ⚠ ausserhalb von 0 bis 100, bitte melden");
}

// ---------------------------------------------------------------- Abgleich von Hand

async function check() {
  const pfade = await readJSON(`${OUT}/_paths.json`, null);
  if (!pfade?.gefunden) { console.error(`${OUT}/_paths.json fehlt. Zuerst --probe ausführen.`); process.exit(1); }
  console.log("Letzte Werte der Gruppe A. Danebenhalten, was du vom Chart abliest.\n");
  for (const m of auswahl) {
    const eintrag = pfade.gefunden[m.id];
    if (!eintrag) { console.log(`– ${m.name.padEnd(34)} kein Pfad`); continue; }
    try {
      const s = ausJSON(await abruf(`${pfade.server}${eintrag.path}/last`), m.field);
      const l = s?.values.at(-1);
      console.log(`  ${m.name.padEnd(34)} ${l ? `${l[0]}  ${l[1]}` : "Form unklar"}`);
      if (l && m.plaus && (l[1] < m.plaus[0] || l[1] > m.plaus[1])) {
        console.log(`   ⚠ ausserhalb von ${m.plaus[0]} bis ${m.plaus[1]}`);
      }
    } catch (e) {
      console.log(`  ${m.name.padEnd(34)} ${e.message}`);
    }
  }
  console.log("\nWeichen Chart und API ab, stimmt die Skala der Handeingabe nicht (HANDOFF §4).");
}

// ---------------------------------------------------------------- Start

if (MODE === "probe") await probe();
else if (MODE === "check") await check();
else if (MODE === "repair") await repair();
else await pull();
