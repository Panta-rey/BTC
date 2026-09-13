#!/usr/bin/env node
// Panta Rey · Ampel – einmaliger Datenabzug von BGeometrics (nur lokal)
//
// WICHTIG: Dieses Script läuft ausschliesslich auf deinem Rechner, nie im GitHub-Runner.
// Es schreibt nach data/private/, das von .gitignore ausgeschlossen ist. Die Rohdaten
// gehen also nie ins öffentliche Repo. Veröffentlicht wird nur der Bericht, den
// scripts/local/compare.mjs daraus erzeugt.
//
// Aufruf:
//   BGEOMETRICS_TOKEN=... node scripts/local/fetch-bgeometrics.mjs
//   BGEOMETRICS_TOKEN=... node scripts/local/fetch-bgeometrics.mjs --only mvrv_z,reserve_risk
//
// Das Script hält sich an das Stundenlimit des Tarifs und wiederholt bei 429.

import { get, sleep } from "../lib/http.mjs";
import { readJSON, writeJSON } from "../lib/store.mjs";

const TOKEN = process.env.BGEOMETRICS_TOKEN;
if (!TOKEN) {
  console.error("BGEOMETRICS_TOKEN fehlt.\nBeispiel: BGEOMETRICS_TOKEN=dein_token node scripts/local/fetch-bgeometrics.mjs");
  process.exit(1);
}
const only = (process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]
  ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null))?.split(",");

const OUT = "data/private";
const PAUSE_MS = 20_000; // sehr konservativ: 3 Abrufe pro Minute

// Pfade aus dem Quellen-Check (M0). Server: siehe config/sources.json.
const METRICS = {
  // Die fünf, die uns fehlen
  sth_realized_price: { path: "/v1/sth-realized-price", zweck: "fehlt" },
  supply_in_profit:   { path: "/v1/supply-profit",      zweck: "fehlt" },
  reserve_risk:       { path: "/v1/reserve-risk",       zweck: "fehlt" },
  rhodl:              { path: "/v1/rhodl-ratio",        zweck: "fehlt" },
  lth_net_position:   { path: "/v1/lth-net-position-change-btc", zweck: "fehlt" },
  // Zur Gegenprobe unserer eigenen Ableitungen aus Coin Metrics
  mvrv_z:             { path: "/v1/mvrv-zscore",   zweck: "gegenprobe", vergleich: "mvrv_z" },
  realized_price:     { path: "/v1/realized-price", zweck: "gegenprobe", vergleich: "realized_price" },
  puell:              { path: "/v1/puell-multiple", zweck: "gegenprobe", vergleich: "puell" },
  hashribbons:        { path: "/v1/hashribbons",    zweck: "gegenprobe" },
  // Nice to have, längere Historie als Deribit
  funding:            { path: "/v1/funding-rate",   zweck: "extra" },
};

// Die Antwortform ist je Endpunkt leicht unterschiedlich. Datum und Wert robust finden.
function toSeries(body) {
  const arr = Array.isArray(body) ? body : Object.values(body || {}).find(Array.isArray);
  if (!Array.isArray(arr) || !arr.length) return null;
  const keys = Object.keys(arr[0]);
  const dKey = keys.find((k) => /^(d|date|day|time|timestamp)$/i.test(k));
  const vKey = keys.find((k) => k !== dKey && typeof arr[0][k] !== "object" &&
    (typeof arr[0][k] === "number" || !Number.isNaN(Number(arr[0][k]))));
  if (!dKey || !vKey) return null;
  const iso = (v) => (typeof v === "number" ? new Date(v < 1e11 ? v * 1000 : v).toISOString().slice(0, 10) : String(v).slice(0, 10));
  const out = arr.map((r) => [iso(r[dKey]), Number(r[vKey])])
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { values: out, valueKey: vKey, dateKey: dKey };
}

const cfgSources = await readJSON("config/sources.json", null);
const SERVER = (cfgSources?.bgeometrics?.server || "https://api.bitcoin-data.com").replace(/\/$/, "");

console.log(`Abzug von ${SERVER}\nZiel: ${OUT}/ (nicht im Repo)\n`);
const summary = [];

for (const [id, m] of Object.entries(METRICS)) {
  if (only && !only.includes(id)) continue;
  const url = SERVER + m.path;
  try {
    const body = await get(url, { headers: { Authorization: `Bearer ${TOKEN}` }, retries: 3, timeout: 60_000 });
    const s = toSeries(body);
    if (!s) throw new Error("Antwort unerwartet aufgebaut");
    await writeJSON(`${OUT}/${id}.json`, {
      id, source: "BGeometrics", path: m.path, zweck: m.zweck,
      value_key: s.valueKey, fetched_at: new Date().toISOString(), values: s.values,
    });
    const first = s.values[0], last = s.values.at(-1);
    summary.push({ id, ok: true, n: s.values.length, von: first[0], bis: last[0], letzter: last[1] });
    console.log(`✓ ${id.padEnd(20)} ${s.values.length.toString().padStart(5)} Punkte  ${first[0]} → ${last[0]}  (Feld "${s.valueKey}")`);
  } catch (e) {
    summary.push({ id, ok: false, fehler: String(e.message || e) });
    console.log(`✗ ${id.padEnd(20)} ${e.message}`);
  }
  await sleep(PAUSE_MS);
}

await writeJSON(`${OUT}/_index.json`, { fetched_at: new Date().toISOString(), server: SERVER, metrics: summary }, { pretty: true });
const ok = summary.filter((x) => x.ok).length;
console.log(`\n${ok} von ${summary.length} Reihen geholt. Weiter mit:\n  node scripts/local/compare.mjs`);
