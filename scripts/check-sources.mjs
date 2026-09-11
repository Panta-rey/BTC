#!/usr/bin/env node
// Panta Rey · Ampel – Quellen-Check (Meilenstein M0)
//
// Prüft aus dem GitHub-Runner heraus, welche Datenquellen antworten, wie weit
// ihre Historie zurückreicht und wie aktuell sie sind. Schreibt:
//   reports/sources-check.md   lesbarer Bericht
//   config/sources.json        Ergebnis für die spätere Pipeline
// Keine Abhängigkeiten. Node 22 oder neuer.
//
// BGeometrics: Standardmässig wird nur die öffentliche API-Doku gelesen (ohne Token).
// Echte Datenabrufe mit Token nur, wenn BGEO_TESTCALLS=true gesetzt ist.
// Grund: Die Nutzungsbedingungen des Gratis-Tarifs sind für eine öffentliche Seite
// mit GitHub-Runnern noch zu klären (siehe SPEC.md, Abschnitt 3.4).

import { mkdir, writeFile, appendFile } from "node:fs/promises";

const UA = "Panta-Rey-BTC-Ampel/0.1 (+https://github.com/Panta-rey/Panta-Rey-BTC-Ampel)";
const TIMEOUT_MS = 20_000;
const DAY = 86_400_000;
const NOW = Date.now();
const BGEO_TOKEN = process.env.BGEOMETRICS_TOKEN || "";
const BGEO_TESTCALLS = String(process.env.BGEO_TESTCALLS || "").toLowerCase() === "true";

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ymd = (ms) => iso(ms).replaceAll("-", "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysOld = (isoDate) => (isoDate ? Math.floor((NOW - Date.parse(isoDate)) / DAY) : null);
const fmtNum = (v) => {
  if (v == null || Number.isNaN(+v)) return "–";
  const n = +v;
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + " Bio.";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + " Mrd.";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + " Mio.";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("de-CH").replace(/[\u2019\u202F\u00A0 ]/g, "'");
  return Math.abs(n) < 1 ? n.toPrecision(3) : n.toFixed(2);
};

// ---------------------------------------------------------------- HTTP

async function get(url, { headers = {}, text = false } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = await res.text();
    let body = null;
    if (text) body = raw;
    else {
      try { body = JSON.parse(raw); } catch { body = null; }
    }
    return { http: res.status, ms: Date.now() - t0, body, snippet: raw.slice(0, 160).replace(/\s+/g, " ") };
  } catch (e) {
    const msg = e?.name === "TimeoutError" ? "Zeitüberschreitung" : (e?.cause?.code || e?.message || "Netzwerkfehler");
    return { http: 0, ms: Date.now() - t0, body: null, snippet: "", error: msg };
  }
}

function httpNote(r) {
  if (r.error) return r.error;
  if (r.http === 451) return "HTTP 451: aus diesem Standort gesperrt (Geo-Blocking)";
  if (r.http === 403) return "HTTP 403: Zugriff verweigert";
  if (r.http === 401) return "HTTP 401: nicht autorisiert (Token?)";
  if (r.http === 429) return "HTTP 429: Rate-Limit erreicht";
  if (r.http >= 400) return `HTTP ${r.http}: ${r.snippet}`;
  return "";
}

// ---------------------------------------------------------------- Ergebnis-Helfer

const results = [];

function record(def, { http, ms, first = null, last = null, count = null, sample = null, note = "" }) {
  let status = "fehler";
  if (http >= 200 && http < 300 && last) {
    const age = daysOld(last);
    status = def.maxAgeDays != null && age > def.maxAgeDays ? "alt" : "ok";
  }
  const row = {
    id: def.id, group: def.group, label: def.label, status, http, ms,
    first, last, age_days: daysOld(last), count,
    sample: def.hideValues ? null : sample,
    note,
  };
  results.push(row);
  const icon = { ok: "✓", alt: "⚠", fehler: "✗" }[status];
  console.log(`${icon} ${def.group.padEnd(12)} ${def.label.padEnd(38)} ${String(http).padStart(3)}  ${first ?? "–"} → ${last ?? "–"}  ${note}`);
  return row;
}

// Einzelabruf mit Parser. parse(body) liefert { first, last, count, sample, note }.
async function single(def, url, parse, opts = {}) {
  const r = await get(url, opts);
  if (r.http >= 200 && r.http < 300 && r.body != null) {
    try {
      const p = parse(r.body) || {};
      return record(def, { http: r.http, ms: r.ms, ...p });
    } catch (e) {
      return record(def, { http: r.http, ms: r.ms, note: `Antwort unerwartet aufgebaut: ${e.message}` });
    }
  }
  return record(def, { http: r.http, ms: r.ms, note: httpNote(r) });
}

// ---------------------------------------------------------------- 1. Preis

async function checkPrice() {
  // Bitstamp: neuester Stand + frühester Stand (zwei Abrufe)
  {
    const def = { id: "price.bitstamp", group: "Preis", label: "Bitstamp OHLC (Tag)", maxAgeDays: 2 };
    const a = await get("https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=3");
    await sleep(300);
    const b = await get("https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=3&start=1313625600");
    const rowsA = a.body?.data?.ohlc || [];
    const rowsB = b.body?.data?.ohlc || [];
    if (a.http === 200 && rowsA.length) {
      const lastRow = rowsA[rowsA.length - 1];
      record(def, {
        http: a.http, ms: a.ms,
        first: rowsB.length ? iso(+rowsB[0].timestamp * 1000) : null,
        last: iso(+lastRow.timestamp * 1000),
        sample: +lastRow.close,
        note: rowsB.length ? "" : "Früheste Daten nicht abrufbar",
      });
    } else record(def, { http: a.http, ms: a.ms, note: httpNote(a) });
  }

  await single(
    { id: "price.coinbase", group: "Preis", label: "Coinbase Exchange Candles", maxAgeDays: 2 },
    "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400",
    (body) => {
      const rows = [...body].sort((x, y) => x[0] - y[0]);
      return {
        first: iso(rows[0][0] * 1000), last: iso(rows.at(-1)[0] * 1000), count: rows.length,
        sample: rows.at(-1)[4], note: "max. 300 Tage pro Abruf, ältere Daten über start/end",
      };
    }
  );

  const binanceParse = (body) => ({ last: iso(body.at(-1)[0]), sample: +body.at(-1)[4], count: body.length });
  await single(
    { id: "price.binance", group: "Preis", label: "Binance api.binance.com (erwartet: 451)", maxAgeDays: 2 },
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=3", binanceParse
  );
  await single(
    { id: "price.binance_vision", group: "Preis", label: "Binance data-api.binance.vision", maxAgeDays: 2 },
    "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=3", binanceParse
  );
}

// ---------------------------------------------------------------- 2. Coin Metrics Community

const CM_METRICS = [
  ["PriceUSD", "Preis (Referenz)"],
  ["CapMrktCurUSD", "Marktkapitalisierung"],
  ["CapMVRVCur", "MVRV-Verhältnis"],
  ["CapRealUSD", "Realized Cap"],
  ["SplyCur", "Umlaufmenge"],
  ["IssTotUSD", "Neuemission in USD (für Puell)"],
  ["HashRate", "Hashrate"],
  ["RevUSD", "Miner-Erlös gesamt"],
];

async function checkCoinMetrics() {
  const base = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&frequency=1d";
  for (const [m, name] of CM_METRICS) {
    const def = { id: `cm.${m}`, group: "Coin Metrics", label: `${m} – ${name}`, maxAgeDays: 5 };
    const a = await get(`${base}&metrics=${m}&page_size=3&paging_from=end`);
    await sleep(700); // Community-Limit: 10 Anfragen pro 6 Sekunden
    const rows = a.body?.data || [];
    if (a.http === 200 && rows.length) {
      const b = await get(`${base}&metrics=${m}&page_size=1&paging_from=start`);
      await sleep(700);
      const firstRow = b.body?.data?.[0];
      const lastRow = rows.at(-1);
      record(def, {
        http: a.http, ms: a.ms,
        first: firstRow ? firstRow.time.slice(0, 10) : null,
        last: lastRow.time.slice(0, 10),
        sample: lastRow[m] != null ? +lastRow[m] : null,
      });
    } else {
      const apiMsg = a.body?.error?.message ? `API: ${a.body.error.message}` : httpNote(a);
      record(def, { http: a.http, ms: a.ms, note: apiMsg || "keine Daten" });
    }
  }
}

// ---------------------------------------------------------------- 3. Miner, Netzwerk

async function checkNetwork() {
  await single(
    { id: "net.mempool_hashrate", group: "Netzwerk", label: "mempool.space Hashrate (gesamt)", maxAgeDays: 5 },
    "https://mempool.space/api/v1/mining/hashrate/all",
    (body) => {
      const h = body.hashrates || [];
      return { first: iso(h[0].timestamp * 1000), last: iso(h.at(-1).timestamp * 1000), count: h.length, sample: h.at(-1).avgHashrate };
    }
  );

  {
    const def = { id: "net.mempool_tip", group: "Netzwerk", label: "mempool.space Blockhöhe", maxAgeDays: 1 };
    const r = await get("https://mempool.space/api/blocks/tip/height", { text: true });
    const height = parseInt(r.body, 10);
    if (r.http === 200 && Number.isFinite(height)) {
      const left = 1_050_000 - height;
      const est = iso(NOW + left * 10 * 60 * 1000);
      record(def, { http: r.http, ms: r.ms, last: iso(NOW), sample: height, note: `noch ${left.toLocaleString("de-CH")} Blöcke bis Halving, grob ${est.slice(0, 7)}` });
    } else record(def, { http: r.http, ms: r.ms, note: httpNote(r) });
  }

  const bcParse = (body) => {
    const v = body.values || [];
    return { first: iso(v[0].x * 1000), last: iso(v.at(-1).x * 1000), count: v.length, sample: v.at(-1).y };
  };
  await single(
    { id: "net.bc_miners_revenue", group: "Netzwerk", label: "Blockchain.com Miner-Erlös", maxAgeDays: 5 },
    "https://api.blockchain.info/charts/miners-revenue?timespan=all&format=json&sampled=false", bcParse
  );
  await single(
    { id: "net.bc_hashrate", group: "Netzwerk", label: "Blockchain.com Hashrate", maxAgeDays: 5 },
    "https://api.blockchain.info/charts/hash-rate?timespan=all&format=json&sampled=false", bcParse
  );
}

// ---------------------------------------------------------------- 4. Stimmung, Funding, Aufmerksamkeit

async function checkSentiment() {
  await single(
    { id: "sent.fng", group: "Stimmung", label: "alternative.me Fear & Greed", maxAgeDays: 3 },
    "https://api.alternative.me/fng/?limit=0&format=json",
    (body) => {
      const d = body.data || [];
      const ts = d.map((x) => +x.timestamp * 1000);
      return { first: iso(Math.min(...ts)), last: iso(Math.max(...ts)), count: d.length, sample: +d[0].value, note: "Quellenangabe neben den Daten erwünscht" };
    }
  );

  for (const [lang, article] of [["en", "Bitcoin"], ["de", "Bitcoin"]]) {
    await single(
      { id: `sent.wiki_${lang}`, group: "Stimmung", label: `Wikipedia-Aufrufe (${lang})`, maxAgeDays: 7 },
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${article}/daily/20150701/${ymd(NOW)}`,
      (body) => {
        const it = body.items || [];
        const d = (t) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
        return { first: d(it[0].timestamp), last: d(it.at(-1).timestamp), count: it.length, sample: it.at(-1).views };
      }
    );
    await sleep(300);
  }

  await single(
    { id: "fund.deribit", group: "Funding", label: "Deribit BTC-PERPETUAL (30 T)", maxAgeDays: 3 },
    `https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=BTC-PERPETUAL&start_timestamp=${NOW - 30 * DAY}&end_timestamp=${NOW}`,
    (body) => {
      const r = body.result || [];
      const avg = r.reduce((s, x) => s + (x.interest_8h ?? 0), 0) / r.length;
      return { first: iso(r[0].timestamp), last: iso(r.at(-1).timestamp), count: r.length, sample: avg * 100, note: "Wert = Ø Funding 8 h in %" };
    }
  );
  await single(
    { id: "fund.okx", group: "Funding", label: "OKX BTC-USDT-SWAP", maxAgeDays: 3 },
    "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100",
    (body) => {
      if (body.code !== "0") throw new Error(body.msg || "Fehlercode " + body.code);
      const d = [...body.data].sort((a, b) => +a.fundingTime - +b.fundingTime);
      const avg = d.reduce((s, x) => s + +x.fundingRate, 0) / d.length;
      return { first: iso(+d[0].fundingTime), last: iso(+d.at(-1).fundingTime), count: d.length, sample: avg * 100, note: "Wert = Ø Funding in %, nur ~3 Monate Historie" };
    }
  );
  await single(
    { id: "fund.bybit", group: "Funding", label: "Bybit BTCUSDT", maxAgeDays: 3 },
    "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200",
    (body) => {
      if (body.retCode !== 0) throw new Error(body.retMsg || "Fehlercode " + body.retCode);
      const d = [...body.result.list].sort((a, b) => +a.fundingRateTimestamp - +b.fundingRateTimestamp);
      const avg = d.reduce((s, x) => s + +x.fundingRate, 0) / d.length;
      return { first: iso(+d[0].fundingRateTimestamp), last: iso(+d.at(-1).fundingRateTimestamp), count: d.length, sample: avg * 100, note: "Wert = Ø Funding in %" };
    }
  );
}

// ---------------------------------------------------------------- 5. BGeometrics

const BGEO_DOC_CANDIDATES = [
  "https://bitcoin-data.com/api/v3/api-docs",
  "https://bitcoin-data.com/v3/api-docs",
  "https://api.bgeometrics.com/v3/api-docs",
  "https://api.bgeometrics.com/openapi.json",
];
const BGEO_WANTED = [
  ["mvrv_z", /mvrv[-_]?z/i],
  ["realized_price", /^(?!.*(sth|lth)).*realized[-_]?price/i],
  ["sth_realized_price", /sth[-_]?realized|realized[-_]?price[-_]?sth/i],
  ["supply_profit", /supply[-_]?(in[-_]?)?profit|profit[-_]?loss[-_]?supply|supply[-_]?loss/i],
  ["puell", /puell/i],
  ["hash_ribbons", /hash[-_]?ribbon/i],
  ["reserve_risk", /reserve[-_]?risk/i],
  ["rhodl", /rhodl/i],
  ["lth_position", /lth.*(position|net|change)|long[-_]?term.*position/i],
  ["funding", /funding/i],
];

// Findet in einer beliebigen JSON-Antwort die Datenreihe und deren Datumsbereich.
function genericSeries(body) {
  const arr = Array.isArray(body) ? body : Object.values(body || {}).find(Array.isArray);
  if (!arr || !arr.length || typeof arr[0] !== "object") return null;
  const dateKey = Object.keys(arr[0]).find((k) => /^(d|date|day|time|timestamp|unixTs|t)$/i.test(k));
  if (!dateKey) return { count: arr.length };
  const toIso = (v) => (typeof v === "number" ? iso(v < 1e11 ? v * 1000 : v) : String(v).slice(0, 10));
  const dates = arr.map((x) => toIso(x[dateKey])).sort();
  return { first: dates[0], last: dates.at(-1), count: arr.length };
}

const bgeo = { docs_url: null, server: null, security: null, paths: {}, testcalls: [] };

async function checkBGeometrics() {
  // 5a. Doku lesen (ohne Token)
  let spec = null;
  for (const url of BGEO_DOC_CANDIDATES) {
    const r = await get(url);
    if (r.http === 200 && r.body?.paths) { spec = r.body; bgeo.docs_url = url; break; }
    await sleep(300);
  }
  const docDef = { id: "bgeo.docs", group: "BGeometrics", label: "API-Doku (OpenAPI, ohne Token)", maxAgeDays: null };
  if (!spec) {
    record(docDef, { http: 0, ms: 0, note: "Maschinenlesbare Doku nicht gefunden. Pfade aus bitcoin-data.com/api/swagger-ui/index.html übernehmen." });
  } else {
    bgeo.server = spec.servers?.[0]?.url || new URL(bgeo.docs_url).origin;
    bgeo.security = spec.components?.securitySchemes || null;
    const allPaths = Object.keys(spec.paths);
    for (const [key, re] of BGEO_WANTED) bgeo.paths[key] = allPaths.filter((p) => re.test(p)).slice(0, 6);
    const found = Object.values(bgeo.paths).filter((v) => v.length).length;
    results.push({
      id: docDef.id, group: docDef.group, label: docDef.label, status: "ok", http: 200, ms: 0,
      first: null, last: null, age_days: null, count: allPaths.length, sample: null,
      note: `${allPaths.length} Pfade, ${found} von ${BGEO_WANTED.length} gesuchten Kennzahlen gefunden`,
    });
    console.log(`✓ BGeometrics  Doku: ${bgeo.docs_url} · ${allPaths.length} Pfade`);
  }

  // 5b. Testabrufe mit Token – nur auf ausdrücklichen Wunsch, höchstens 3
  if (!BGEO_TESTCALLS) {
    record({ id: "bgeo.data", group: "BGeometrics", label: "Datenabruf mit Token", maxAgeDays: null },
      { http: 0, ms: 0, note: "übersprungen (BGEO_TESTCALLS nicht gesetzt)" });
    results.at(-1).status = "übersprungen";
    return;
  }
  if (!BGEO_TOKEN) {
    record({ id: "bgeo.data", group: "BGeometrics", label: "Datenabruf mit Token", maxAgeDays: null },
      { http: 0, ms: 0, note: "Secret BGEOMETRICS_TOKEN fehlt" });
    return;
  }
  const picks = ["mvrv_z", "sth_realized_price", "supply_profit"]
    .map((k) => [k, (bgeo.paths[k] || []).find((p) => !p.includes("{"))])
    .filter(([, p]) => p);
  for (const [key, path] of picks) {
    const def = { id: `bgeo.${key}`, group: "BGeometrics", label: `${key} (${path})`, maxAgeDays: 10, hideValues: true };
    const url = bgeo.server.replace(/\/$/, "") + path;
    const r = await get(url, { headers: { Authorization: `Bearer ${BGEO_TOKEN}` } });
    const s = r.http === 200 ? genericSeries(r.body) : null;
    bgeo.testcalls.push({ key, path, http: r.http });
    record(def, { http: r.http, ms: r.ms, ...(s || {}), note: s ? "Werte absichtlich nicht protokolliert" : httpNote(r) });
    await sleep(1000);
  }
}

// ---------------------------------------------------------------- Auswertung

const ok = (id) => results.find((r) => r.id === id)?.status === "ok";
const firstOk = (ids) => ids.find(ok) || null;

function decide() {
  const price = firstOk(["price.bitstamp", "price.coinbase", "price.binance_vision"]);
  const cmMvrv = ok("cm.CapMVRVCur") && (ok("cm.PriceUSD") || price);
  const bgeoOk = (k) => ok(`bgeo.${k}`);
  const chosen = {
    price: price,
    price_history_seed: ok("cm.PriceUSD") ? "cm.PriceUSD" : null,
    realized_price: ok("cm.CapRealUSD") ? "cm.CapRealUSD" : cmMvrv ? "abgeleitet: Preis ÷ cm.CapMVRVCur" : bgeoOk("realized_price") ? "bgeo" : null,
    mvrv_z: cmMvrv ? "selbst berechnet aus cm.CapMrktCurUSD und cm.CapMVRVCur" : bgeoOk("mvrv_z") ? "bgeo" : null,
    puell: ok("cm.IssTotUSD") ? "selbst berechnet aus cm.IssTotUSD" : ok("net.bc_miners_revenue") ? "Näherung aus net.bc_miners_revenue (inkl. Gebühren)" : null,
    hash_ribbons: firstOk(["cm.HashRate", "net.mempool_hashrate", "net.bc_hashrate"]),
    fear_greed: ok("sent.fng") ? "sent.fng" : null,
    funding: firstOk(["fund.deribit", "fund.okx", "fund.bybit"]),
    retail_attention: ok("sent.wiki_en") ? (ok("sent.wiki_de") ? "sent.wiki_en + sent.wiki_de" : "sent.wiki_en") : null,
    halving: ok("net.mempool_tip") ? "net.mempool_tip" : null,
    sth_realized_price: bgeoOk("sth_realized_price") ? "bgeo (Lizenz klären)" : "manual.json",
    supply_loss: bgeoOk("supply_profit") ? "bgeo (Lizenz klären)" : null,
    reserve_risk: null,
    rhodl: null,
    lth_dist: null,
  };
  return chosen;
}

const LABELS = {
  price: "BTC-Tagesschluss",
  price_history_seed: "Preis-Seed vor 2011",
  realized_price: "Realized Price",
  mvrv_z: "MVRV-Z-Score",
  puell: "Puell Multiple",
  hash_ribbons: "Hash Ribbons",
  fear_greed: "Fear & Greed",
  funding: "Funding",
  retail_attention: "Wikipedia-Aufmerksamkeit",
  halving: "Blockhöhe / Halving",
  sth_realized_price: "STH-Realized-Price",
  supply_loss: "Angebot im Verlust",
  reserve_risk: "Reserve Risk",
  rhodl: "RHODL-Ratio",
  lth_dist: "Abgabe der Langzeithalter",
};

function report(chosen) {
  const icon = (s) => ({ ok: "✓", alt: "⚠ alt", fehler: "✗", "übersprungen": "–" }[s] || s);
  const lines = [];
  lines.push("# Quellen-Check", "");
  lines.push(`Erstellt: ${new Date(NOW).toISOString().replace("T", " ").slice(0, 16)} UTC · Runner: ${process.env.RUNNER_OS || "lokal"} · Node ${process.version}`, "");
  lines.push("## Ergebnis je Quelle", "");
  lines.push("| Gruppe | Quelle | Status | HTTP | Daten von | bis | Punkte | Letzter Wert | Hinweis |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.group} | ${r.label} | ${icon(r.status)} | ${r.http || "–"} | ${r.first ?? "–"} | ${r.last ?? "–"} | ${r.count ?? "–"} | ${r.sample == null ? "–" : fmtNum(r.sample)} | ${String(r.note || "").replaceAll("|", "/")} |`);
  }
  lines.push("", "## Was das für die Ampel heisst", "");
  lines.push("| Kennzahl | Quelle nach diesem Check |", "|---|---|");
  for (const [k, v] of Object.entries(chosen)) lines.push(`| ${LABELS[k] || k} | ${v ?? "✗ keine freie Quelle – Familie wird herausgerechnet oder manuell"} |`);
  lines.push("", "## BGeometrics", "");
  if (bgeo.docs_url) {
    lines.push(`Doku gefunden: ${bgeo.docs_url} · Server: ${bgeo.server}`, "");
    lines.push("| Kennzahl | gefundene Pfade |", "|---|---|");
    for (const [k, v] of Object.entries(bgeo.paths)) lines.push(`| ${k} | ${v.length ? v.map((p) => "`" + p + "`").join(", ") : "–"} |`);
    if (bgeo.security) lines.push("", "Authentifizierung laut Doku: `" + JSON.stringify(bgeo.security).slice(0, 300) + "`");
  } else {
    lines.push("Keine maschinenlesbare Doku gefunden. Pfade bitte aus https://bitcoin-data.com/api/swagger-ui/index.html übernehmen.");
  }
  lines.push("", "Hinweis: Die Gratis-Nutzung von BGeometrics ist für persönliche Projekte gedacht. Abrufe von fremden Systemen (GitHub-Runner) und die Anzeige der Daten auf einer öffentlichen Seite gelten laut Nutzungsbedingungen als kommerzielle Weiterverbreitung. Vor dem Einsatz in der Pipeline schriftlich klären.");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  console.log("Panta Rey · Ampel – Quellen-Check\n");
  const steps = [checkPrice, checkCoinMetrics, checkNetwork, checkSentiment, checkBGeometrics];
  for (const step of steps) {
    try { await step(); } catch (e) { console.error(`Fehler in ${step.name}:`, e); }
  }
  const chosen = decide();
  const md = report(chosen);
  await mkdir("reports", { recursive: true });
  await mkdir("config", { recursive: true });
  await writeFile("reports/sources-check.md", md);
  await writeFile("config/sources.json", JSON.stringify({
    schema: 1,
    generated_at: new Date(NOW).toISOString(),
    runner: { os: process.env.RUNNER_OS || "lokal", node: process.version },
    checks: results,
    chosen,
    bgeometrics: bgeo,
  }, null, 2) + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(`\nFertig: ${n("ok")} ok · ${n("alt")} alt · ${n("fehler")} Fehler. Bericht: reports/sources-check.md`);
}

main();
