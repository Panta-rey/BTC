#!/usr/bin/env node
// Panta Rey · Ampel – Datenabruf (Meilenstein M1)
//
// Holt jede Quelle einzeln und legt sie unverändert als Tagesreihe in data/raw/ ab.
// Fällt eine Quelle aus, laufen die anderen weiter; der alte Stand bleibt erhalten.
// Beim ersten Lauf wird die ganze Historie geholt, danach nur die letzten Tage.
// BGeometrics wird bewusst nicht abgerufen, solange die Nutzungsbedingungen offen sind.

import { get, sleep } from "./lib/http.mjs";
import { readJSON, writeJSON, mergeValues } from "./lib/store.mjs";
import { DAY, iso, parseDay } from "../engine/dates.mjs";

const RAW = "data/raw";
const NOW = Date.now();
const TODAY = iso(NOW); // unvollständiger Tag, wird nie gespeichert
const status = {};

const complete = (d) => d < TODAY;
const lastDate = (raw) => raw?.values?.at(-1)?.[0] ?? null;

async function step(id, fn) {
  const t0 = Date.now();
  try {
    const info = await fn();
    status[id] = { ok: true, at: new Date().toISOString(), ms: Date.now() - t0, ...info };
    console.log(`✓ ${id.padEnd(18)} bis ${info.last ?? "–"}  (+${info.added ?? 0} Einträge)`);
  } catch (e) {
    status[id] = { ok: false, at: new Date().toISOString(), ms: Date.now() - t0, error: String(e.message || e) };
    console.log(`✗ ${id.padEnd(18)} ${status[id].error}`);
  }
}

async function saveSeries(id, source, unit, oldRaw, fresh) {
  const values = mergeValues(oldRaw?.values, fresh);
  if (!values.length) throw new Error("keine Daten erhalten");
  await writeJSON(`${RAW}/${id}.json`, { id, source, unit, updated_at: new Date(NOW).toISOString(), values });
  return { first: values[0][0], last: values.at(-1)[0], added: fresh.length };
}

// ---------------------------------------------------------------- Preis

async function bitstamp() {
  const old = await readJSON(`${RAW}/price_bitstamp.json`);
  let start = lastDate(old) ? parseDay(lastDate(old)) / 1000 - 7 * 86400 : 1313625600; // 2011-08-18
  const fresh = [];
  for (let page = 0; page < 20; page++) {
    const j = await get(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${start}`);
    const rows = j?.data?.ohlc || [];
    if (!rows.length) break;
    for (const r of rows) {
      const d = iso(+r.timestamp * 1000);
      if (complete(d)) fresh.push([d, +r.close]);
    }
    const lastT = +rows.at(-1).timestamp;
    if (rows.length < 1000 || iso(lastT * 1000) >= TODAY) break;
    start = lastT + 86400;
    await sleep(400);
  }
  return saveSeries("price_bitstamp", "Bitstamp", "USD", old, fresh);
}

async function coinbase() {
  // Nur die letzten ~300 Tage: dient als Lückenfüller, falls Bitstamp ausfällt.
  const old = await readJSON(`${RAW}/price_coinbase.json`);
  const rows = await get("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400");
  const fresh = rows.map((r) => [iso(r[0] * 1000), +r[4]]).filter(([d]) => complete(d));
  return saveSeries("price_coinbase", "Coinbase Exchange", "USD", old, fresh);
}

// ---------------------------------------------------------------- Coin Metrics Community

const CM_METRICS = ["PriceUSD", "CapMrktCurUSD", "CapMVRVCur", "IssTotUSD", "HashRate", "SplyCur"];

async function coinMetricsPages(metrics, start) {
  let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=${metrics.join(",")}` +
    `&frequency=1d&page_size=10000&start_time=${start}`;
  const rows = [];
  for (let page = 0; url && page < 20; page++) {
    const j = await get(url);
    rows.push(...(j.data || []));
    url = j.next_page_url || null;
    if (url) await sleep(700);
  }
  return rows;
}

async function coinMetrics() {
  const old = await readJSON(`${RAW}/coinmetrics.json`);
  const oldLast = old ? Object.values(old.values).map((v) => v.at(-1)?.[0]).filter(Boolean).sort()[0] : null;
  const start = oldLast ? iso(parseDay(oldLast) - 10 * DAY) : "2009-01-03"; // 10 Tage zurück wegen Nachkorrekturen

  let rows;
  try {
    rows = await coinMetricsPages(CM_METRICS, start);
  } catch (e) {
    // Fällt der Sammelabruf (z. B. eine Kennzahl gestrichen), einzeln versuchen
    rows = [];
    for (const m of CM_METRICS) {
      try { rows.push(...(await coinMetricsPages([m], start))); } catch { /* Kennzahl fehlt */ }
      await sleep(700);
    }
    if (!rows.length) throw e;
  }

  const values = {};
  let added = 0;
  for (const m of CM_METRICS) {
    const fresh = rows
      .filter((r) => r[m] != null)
      .map((r) => [r.time.slice(0, 10), +r[m]])
      .filter(([d, v]) => complete(d) && Number.isFinite(v));
    values[m] = mergeValues(old?.values?.[m], fresh);
    added += fresh.length;
  }
  const lasts = Object.values(values).map((v) => v.at(-1)?.[0]).filter(Boolean).sort();
  if (!lasts.length) throw new Error("keine Daten erhalten");
  await writeJSON(`${RAW}/coinmetrics.json`, {
    id: "coinmetrics", source: "Coin Metrics Community (CC BY-NC 4.0)", unit: "je Kennzahl",
    updated_at: new Date(NOW).toISOString(), values,
  });
  return { last: lasts[0], added };
}

// ---------------------------------------------------------------- Stimmung, Funding, Aufmerksamkeit

async function fearGreed() {
  const j = await get("https://api.alternative.me/fng/?limit=0&format=json");
  const fresh = (j.data || []).map((x) => [iso(+x.timestamp * 1000), +x.value]).filter(([d]) => complete(d));
  return saveSeries("fng", "alternative.me Fear & Greed Index", "0–100", null, fresh);
}

async function wikipedia(lang) {
  const end = iso(NOW - DAY).replaceAll("-", "");
  const j = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/Bitcoin/daily/20150701/${end}`);
  const fresh = (j.items || []).map((x) => [`${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}`, +x.views]);
  return saveSeries(`wiki_${lang}`, `Wikimedia Pageviews (${lang}.wikipedia, Artikel Bitcoin)`, "Aufrufe pro Tag", null, fresh);
}

async function deribitFunding() {
  // Stündliche Werte, gespeichert als Tagesdurchschnitt von interest_8h in Prozent.
  const old = await readJSON(`${RAW}/funding_deribit.json`);
  const startMs = lastDate(old) ? parseDay(lastDate(old)) - 3 * DAY : Date.parse("2019-01-01T00:00:00Z");
  const seen = new Set();
  const acc = new Map();
  for (let s = startMs; s < NOW; s += 30 * DAY) {
    const e = Math.min(s + 30 * DAY, NOW);
    const j = await get(`https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=BTC-PERPETUAL&start_timestamp=${s}&end_timestamp=${e}`);
    for (const r of j.result || []) {
      if (seen.has(r.timestamp) || r.interest_8h == null) continue;
      seen.add(r.timestamp);
      const d = iso(r.timestamp);
      if (!complete(d)) continue;
      const a = acc.get(d) || [0, 0];
      acc.set(d, [a[0] + r.interest_8h * 100, a[1] + 1]);
    }
    await sleep(250);
  }
  const fresh = [...acc.entries()].filter(([, [, c]]) => c >= 12).map(([d, [s, c]]) => [d, s / c]);
  return saveSeries("funding_deribit", "Deribit BTC-PERPETUAL", "% pro 8 h (Tagesdurchschnitt)", old, fresh);
}

// ---------------------------------------------------------------- Netzwerk

async function network() {
  const height = parseInt(await get("https://mempool.space/api/blocks/tip/height", { text: true }), 10);
  if (!Number.isFinite(height)) throw new Error("Blockhöhe unlesbar");
  let timeAvg = null;
  try { timeAvg = (await get("https://mempool.space/api/v1/difficulty-adjustment")).timeAvg ?? null; } catch { /* optional */ }
  await writeJSON(`${RAW}/network.json`, { id: "network", source: "mempool.space", updated_at: new Date(NOW).toISOString(), height, time_avg_ms: timeAvg }, { pretty: true });
  return { last: TODAY, added: 1 };
}

// ---------------------------------------------------------------- Ablauf

console.log(`Panta Rey · Ampel – Datenabruf ${new Date(NOW).toISOString()}\n`);
await step("price_bitstamp", bitstamp);
await step("price_coinbase", coinbase);
await step("coinmetrics", coinMetrics);
await step("fng", fearGreed);
await step("wiki_en", () => wikipedia("en"));
await step("wiki_de", () => wikipedia("de"));
await step("funding_deribit", deribitFunding);
await step("network", network);

const old = await readJSON(`${RAW}/_status.json`, {});
await writeJSON(`${RAW}/_status.json`, { ...old, ...status, _run: { at: new Date(NOW).toISOString() } }, { pretty: true });
const failed = Object.values(status).filter((s) => !s.ok).length;
console.log(`\nFertig: ${Object.keys(status).length - failed} ok, ${failed} ausgefallen.`);
