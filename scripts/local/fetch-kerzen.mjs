#!/usr/bin/env node
// Panta Rey · Ampel – Kerzenarchiv von Bitstamp (nur lokal)
//
// Holt die vollständige BTC/USD-Kerzenhistorie in beliebiger Auflösung, zum Beispiel
// 4 Stunden. Braucht kein Abo und keinen Schlüssel, dieselbe Schnittstelle nutzt die
// Pipeline bereits für die Tagesschlüsse.
//
// ACHTUNG, das ist ein ARCHIV und kein Eingang in die Ampel:
//   · Jede Signalbedingung wird ausschliesslich auf Wochenschlüssen geprüft, und
//     Intraday-Spitzen werden bewusst ignoriert (SPEC 2.3). Das Allzeithoch der
//     Ampel liegt deshalb bei 124'728 und nicht bei 126'200.
//   · Eine Reihe stammt immer aus einer Quelle (SPEC 3.2). Diese Kerzen dürfen die
//     bestehende Preisreihe nicht ergänzen oder überschreiben.
// Die Datei landet deshalb in data/private/ und nie in data/raw/.
//
// Aufruf:
//   node scripts/local/fetch-kerzen.mjs                 4 Stunden, seit 2011
//   node scripts/local/fetch-kerzen.mjs --step=3600     1 Stunde
//   node scripts/local/fetch-kerzen.mjs --ab=2017-01-01 späterer Beginn
//   node scripts/local/fetch-kerzen.mjs --csv           zusätzlich als CSV
//
// Erlaubte Schritte laut Bitstamp: 60, 180, 300, 900, 1800, 3600, 7200, 14400,
// 21600, 43200, 86400, 259200 Sekunden.

import { get, sleep } from "../lib/http.mjs";
import { readJSON, writeJSON } from "../lib/store.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const arg = (n, d = null) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const STEP = Number(arg("step", 14400));
const AB = arg("ab", "2011-08-18");
const OUT = (arg("out", "data/private") || "data/private").replace(/\/$/, "");
const CSV = process.argv.includes("--csv");
const PAIR = arg("paar", "btcusd");

const ERLAUBT = [60, 180, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 259200];
if (!ERLAUBT.includes(STEP)) {
  console.error(`Schritt ${STEP} ist nicht erlaubt. Möglich: ${ERLAUBT.join(", ")} Sekunden.`);
  process.exit(1);
}

const name = STEP >= 86400 ? `${STEP / 86400}d` : STEP >= 3600 ? `${STEP / 3600}h` : `${STEP / 60}m`;
const ZIEL = `${OUT}/kerzen_${PAIR}_${name}.json`;

// Vorhandenes Archiv fortschreiben statt neu holen.
const alt = await readJSON(ZIEL, null);
const kerzen = new Map((alt?.values ?? []).map((r) => [r[0], r]));
const abT = Math.floor(Date.parse(AB + "T00:00:00Z") / 1000);
let start = alt?.values?.length
  ? Math.floor(Date.parse(alt.values.at(-1)[0]) / 1000) - STEP
  : abT;

const erwartet = Math.ceil((Date.now() / 1000 - start) / STEP);
console.log(`Bitstamp ${PAIR}, Schritt ${name}, ab ${new Date(start * 1000).toISOString().slice(0, 16)}`);
console.log(`Etwa ${erwartet.toLocaleString("de-CH")} Kerzen, ${Math.ceil(erwartet / 1000)} Seiten à 1000.`);
if (alt?.values?.length) console.log(`Archiv vorhanden: ${alt.values.length} Kerzen, wird fortgeschrieben.`);
console.log("");

const jetzt = Math.floor(Date.now() / 1000);
let seiten = 0, neu = 0;
while (start < jetzt && seiten < 500) {
  const url = `https://www.bitstamp.net/api/v2/ohlc/${PAIR}/?step=${STEP}&limit=1000&start=${start}`;
  let rows;
  try {
    const j = await get(url, { retries: 3, timeout: 45_000 });
    rows = j?.data?.ohlc ?? [];
  } catch (e) {
    console.log(`\nAbbruch bei Seite ${seiten + 1}: ${e.message}`);
    console.log("Das Bisherige wird gespeichert, ein erneuter Aufruf setzt dort fort.");
    break;
  }
  if (!rows.length) break;

  for (const r of rows) {
    const t = new Date(+r.timestamp * 1000).toISOString().slice(0, 19) + "Z";
    if (!kerzen.has(t)) neu++;
    kerzen.set(t, [t, +r.open, +r.high, +r.low, +r.close, +r.volume]);
  }
  seiten++;
  const letzte = +rows.at(-1).timestamp;
  if (seiten % 5 === 0 || rows.length < 1000) {
    process.stdout.write(`\r${seiten} Seiten · ${kerzen.size.toLocaleString("de-CH")} Kerzen · bis ${new Date(letzte * 1000).toISOString().slice(0, 10)}   `);
  }
  if (rows.length < 1000) break;
  start = letzte + STEP;
  await sleep(500);            // höflich bleiben, die Schnittstelle ist frei
}

const values = [...kerzen.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
if (!values.length) { console.error("\nKeine Kerzen erhalten."); process.exit(1); }

await writeJSON(ZIEL, {
  id: `kerzen_${PAIR}_${name}`, source: "Bitstamp", pair: PAIR, step_seconds: STEP,
  columns: ["t", "open", "high", "low", "close", "volume"],
  zweck: "Archiv. Kein Eingang in die Ampel: Signale nur auf Wochenschlüssen (SPEC 2.3), eine Quelle je Reihe (SPEC 3.2).",
  fetched_at: new Date().toISOString(), values,
});

if (CSV) {
  const pfad = ZIEL.replace(/\.json$/, ".csv");
  await mkdir(OUT, { recursive: true });
  await writeFile(pfad, "t,open,high,low,close,volume\n" + values.map((r) => r.join(",")).join("\n") + "\n");
  console.log(`\nCSV: ${pfad}`);
}

const mb = (JSON.stringify(values).length / 1048576).toFixed(1);
console.log(`\n\n${values.length.toLocaleString("de-CH")} Kerzen (${neu.toLocaleString("de-CH")} neu), ${values[0][0].slice(0, 10)} → ${values.at(-1)[0].slice(0, 10)}, ${mb} MB`);
console.log(`Gespeichert: ${ZIEL}`);
console.log("Liegt in data/private/ und ist von .gitignore ausgeschlossen.");
