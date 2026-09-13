#!/usr/bin/env node
// Panta Rey · Ampel – lokaler Vergleich mit den BGeometrics-Daten
//
// Beantwortet zwei Fragen und schreibt reports/bgeometrics-vergleich.md:
//   1. Wie gut treffen unsere eigenen Ableitungen aus Coin Metrics die veröffentlichten Reihen?
//   2. Wird das System besser oder schlechter, wenn die fünf fehlenden Kennzahlen dazukommen?
//
// Läuft nur lokal und liest data/private/. Der erzeugte Bericht enthält Kennzahlen
// über die Daten, nicht die Daten selbst, und darf deshalb ins Repo.
//
// Aufruf:  node scripts/local/compare.mjs

import { readJSON, writeJSON } from "../lib/store.mjs";
import { toRows } from "../../engine/rows.mjs";
import { replay, PHASE_NAMES } from "../../engine/phases.mjs";
import { simulate, assess, tranchesByWeek, maxDrawdown, CORE, fmtUSD, fmtBTC } from "../lib/sim.mjs";
import { daysBetween } from "../../engine/dates.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const P = "data/private";
const weekly = await readJSON("data/weekly.json");
const cfg = await readJSON("config/engine.json");
if (!weekly || !cfg) { console.error("data/weekly.json oder config/engine.json fehlt."); process.exit(1); }
const idx = await readJSON(`${P}/_index.json`, null);
if (!idx) { console.error(`${P}/ ist leer. Zuerst scripts/local/fetch-bgeometrics.mjs ausführen.`); process.exit(1); }

const load = async (id) => (await readJSON(`${P}/${id}.json`, null))?.values ?? null;
const wochen = weekly.rows.map((r) => r[0]);
const spalte = (name) => { const i = weekly.columns.indexOf(name); return i < 0 ? [] : weekly.rows.map((r) => r[i]); };

// Tageswerte auf unsere Wochenschlüsse abbilden: Wert vom Sonntag oder bis zu 10 Tage davor.
function aufWochen(values, transform = (v) => v) {
  if (!values) return null;
  const map = new Map(values);
  const out = {};
  for (const w of wochen) {
    for (let k = 0; k <= 10; k++) {
      const d = new Date(Date.parse(w + "T00:00:00Z") - k * 86400000).toISOString().slice(0, 10);
      if (map.has(d)) { out[w] = transform(map.get(d)); break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 1. Gegenprobe

const VERGLEICHE = [
  { id: "realized_price", unser: "realized_price", name: "Realized Price", einheit: "USD" },
  { id: "mvrv_z",         unser: "mvrv_z",         name: "MVRV-Z-Score",   einheit: "σ" },
  { id: "puell",          unser: "puell",          name: "Puell Multiple", einheit: "×" },
];

function statistik(a, b) {
  const paare = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && Number.isFinite(x) && Number.isFinite(y));
  if (paare.length < 30) return null;
  const n = paare.length;
  const mx = paare.reduce((s, [x]) => s + x, 0) / n, my = paare.reduce((s, [, y]) => s + y, 0) / n;
  let cov = 0, vx = 0, vy = 0, absAbw = 0, relAbw = 0, maxRel = 0;
  for (const [x, y] of paare) {
    cov += (x - mx) * (y - my); vx += (x - mx) ** 2; vy += (y - my) ** 2;
    absAbw += Math.abs(x - y);
    if (y !== 0) { const r = Math.abs(x / y - 1); relAbw += r; maxRel = Math.max(maxRel, r); }
  }
  return { n, korrelation: cov / Math.sqrt(vx * vy), mittlereAbweichung: absAbw / n,
           mittlereRelativeAbweichung: relAbw / n, groessteRelativeAbweichung: maxRel,
           unserSchnitt: mx, ihrSchnitt: my };
}

const gegenprobe = [];
for (const v of VERGLEICHE) {
  const ihre = aufWochen(await load(v.id));
  if (!ihre) { gegenprobe.push({ ...v, fehlt: true }); continue; }
  const unser = spalte(v.unser);
  const ihrArr = wochen.map((w) => ihre[w] ?? null);
  gegenprobe.push({ ...v, stat: statistik(unser, ihrArr) });
}

// ---------------------------------------------------------------- 2. Wirkung auf das System

const manualVoll = {
  sth_rp:       aufWochen(await load("sth_realized_price")),
  supply_loss:  aufWochen(await load("supply_in_profit"), (v) => (v > 1.5 ? 100 - v : 100 - v * 100)),
  reserve_risk: aufWochen(await load("reserve_risk")),
  rhodl:        aufWochen(await load("rhodl")),
  lth_dist:     aufWochen(await load("lth_net_position"), (v) => -v),
};
const vorhanden = Object.fromEntries(Object.entries(manualVoll).map(([k, v]) => [k, v ? Object.keys(v).length : 0]));

function lauf(manual, label) {
  const rows = toRows(weekly, { manual });
  const run = replay(rows, cfg);
  const sim = simulate(run.weeks, tranchesByWeek(run.events));
  const checks = assess(run, sim.trades);
  const last = run.weeks.at(-1);
  return { label, run, sim, checks, last,
    wert: sim.btc * last.close + sim.cash,
    erfuellt: checks.filter((c) => c.ok).length };
}

const ohne = lauf({}, "ohne Zusatzdaten (Stand heute)");
const mit  = lauf(manualVoll, "mit BGeometrics-Daten");
// Nur der STH-Einstand, um seinen Anteil am Unterschied zu isolieren
const nurSth = lauf({ sth_rp: manualVoll.sth_rp }, "nur STH-Einstand");

function phasenListe(run) {
  const out = []; let start = run.weeks[0], prev = run.weeks[0];
  for (const w of run.weeks.slice(1).concat([null])) {
    if (!w || w.phase !== prev.phase) { out.push({ von: start.w, bis: prev.w, phase: prev.phase }); start = w; }
    if (!w) break; prev = w;
  }
  return out;
}

// ---------------------------------------------------------------- Bericht

const L = [];
L.push("# BGeometrics: Vergleich", "");
L.push(`Erstellt ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Konfiguration \`${cfg.version}\` · ${wochen.length} Wochen`, "");
L.push("> Dieser Bericht entstand lokal aus einem zeitlich begrenzten BGeometrics-Zugang. Er enthält Kennzahlen über die Daten, nicht die Daten selbst. Die Rohreihen liegen in `data/private/` und sind von `.gitignore` ausgeschlossen.", "");

L.push("## 1. Wie gut rechnen wir selbst?", "");
L.push("Wir leiten mehrere Kennzahlen aus Coin Metrics ab, statt sie fertig zu beziehen. Hier der Abgleich mit den veröffentlichten Reihen.", "");
L.push("| Kennzahl | Punkte | Korrelation | Ø Abweichung | Ø relativ | grösste relativ |", "|---|---|---|---|---|---|");
for (const g of gegenprobe) {
  if (g.fehlt) { L.push(`| ${g.name} | – | nicht abgezogen | | | |`); continue; }
  if (!g.stat) { L.push(`| ${g.name} | zu wenige | – | | | |`); continue; }
  const s = g.stat;
  L.push(`| ${g.name} | ${s.n} | ${s.korrelation.toFixed(4)} | ${s.mittlereAbweichung < 1 ? s.mittlereAbweichung.toFixed(4) : fmtUSD(s.mittlereAbweichung)} ${g.einheit} | ${(s.mittlereRelativeAbweichung * 100).toFixed(2)} % | ${(s.groessteRelativeAbweichung * 100).toFixed(1)} % |`);
}
L.push("", "Eine Korrelation nahe 1 bei kleiner relativer Abweichung bedeutet: Unsere Ableitung ist tragfähig, und die freie Pipeline genügt auch ohne Abo.", "");

L.push("## 2. Verändern die Zusatzdaten das Ergebnis?", "");
L.push(`Abgezogene Wochenwerte je Kennzahl: ${Object.entries(vorhanden).map(([k, n]) => `${k} ${n}`).join(" · ")}`, "");
L.push("| Variante | Endvermögen | BTC | Cash | Transaktionen | Kriterien | grösster Rückgang |", "|---|---|---|---|---|---|---|");
for (const v of [ohne, nurSth, mit]) {
  L.push(`| ${v.label} | ${fmtUSD(v.wert)} | ${fmtBTC(v.sim.btc)} | ${fmtUSD(v.sim.cash)} | ${v.sim.trades.length} | ${v.erfuellt} von ${v.checks.length} | ${(maxDrawdown(v.sim.equity) * 100).toFixed(1)} % |`);
}
L.push("");

L.push("### Kriterien im Einzelnen", "");
L.push("| Ereignis | ohne | nur STH | mit allen |", "|---|---|---|---|");
for (let i = 0; i < ohne.checks.length; i++) {
  const c = ohne.checks[i];
  const z = (v) => { const x = v.checks[i]; return `${x.ok ? "✓" : "✗"} ${x.ratio ? x.ratio.toFixed(2) + " ×" : "–"}`; };
  L.push(`| ${c.kind} ${c.date} | ${z(ohne)} | ${z(nurSth)} | ${z(mit)} |`);
}
L.push("");

L.push("### Phasenwechsel im Vergleich", "");
L.push("Der Trendfilter sollte laut Spezifikation Trendband **und** STH-Einstand prüfen. Historisch fehlte der zweite Teil. Hier zeigt sich, ob er die Übergänge verschiebt.", "");
const pa = phasenListe(ohne.run), pb = phasenListe(mit.run);
L.push("| # | ohne Zusatzdaten | mit BGeometrics | Verschiebung |", "|---|---|---|---|");
for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
  const a = pa[i], b = pb[i];
  const d = a && b && a.von !== b.von ? `${Math.round(daysBetween(a.von, b.von) / 7)} Wochen` : (a && b ? "keine" : "–");
  L.push(`| ${i + 1} | ${a ? `${a.von} → Phase ${a.phase}` : "–"} | ${b ? `${b.von} → Phase ${b.phase}` : "–"} | ${d} |`);
}
L.push("");

L.push("### Aktueller Stand", "");
L.push("| Variante | Phase | seit | Kauf-Motor | Verkauf-Motor | Abdeckung Kauf / Verkauf |", "|---|---|---|---|---|---|");
for (const v of [ohne, mit]) {
  L.push(`| ${v.label} | ${v.last.phase} ${PHASE_NAMES[v.last.phase]} | ${v.run.state.phase_since} | ${v.last.buy} | ${v.last.sell} | ${Math.round(v.last.buy_cov * 100)} % / ${Math.round(v.last.sell_cov * 100)} % |`);
}
L.push("");

L.push("## Schlussfolgerung", "");
const dWert = ohne.wert ? (mit.wert / ohne.wert - 1) * 100 : 0;
const dKrit = mit.erfuellt - ohne.erfuellt;
const gleich = Math.abs(dWert) < 3 && dKrit === 0;
if (!ohne.sim.trades.length && !mit.sim.trades.length) {
  L.push("In keiner Variante kam es zu Transaktionen. Das deutet auf unvollständige oder künstliche Eingangsdaten hin, nicht auf ein Ergebnis. Bitte prüfen, ob `data/weekly.json` aus einem echten Wochenlauf stammt.");
} else if (gleich) {
  L.push(`Kein belastbarer Unterschied: ${fmtUSD(mit.wert)} gegen ${fmtUSD(ohne.wert)} (${dWert >= 0 ? "+" : ""}${dWert.toFixed(1)} %), gleich viele erfüllte Kriterien. **Ein dauerhaftes Abo lohnt sich nach diesen Zahlen nicht.**`);
} else if (dKrit > 0 && dWert > 0) {
  L.push(`Die Zusatzdaten verbessern beides: ${fmtUSD(mit.wert)} gegen ${fmtUSD(ohne.wert)} (${dWert >= 0 ? "+" : ""}${dWert.toFixed(1)} %) bei ${mit.erfuellt} statt ${ohne.erfuellt} erfüllten Kriterien. **Ein dauerhaftes Abo wäre begründbar.**`);
} else if (dKrit < 0) {
  L.push(`Die Zusatzdaten kosten ein Kriterium (${mit.erfuellt} statt ${ohne.erfuellt}). Vermutliche Ursache: Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2 von 32 auf 40, und das knappe Signal von 2025 fällt darunter. Vor einem Abo klären, ob das gewollt ist.`);
} else {
  L.push(`Gemischtes Bild: Endvermögen ${dWert >= 0 ? "+" : ""}${dWert.toFixed(1)} %, erfüllte Kriterien ${dKrit >= 0 ? "+" : ""}${dKrit}. Die Tabelle der Phasenwechsel zeigt, wo sich die Signale verschieben.`);
}
L.push("", "Wichtig: Vier Zyklen sind eine dünne Grundlage. Ein Unterschied von wenigen Prozent ist Rauschen, kein Beleg.", "");

const md = L.join("\n") + "\n";
await mkdir("reports", { recursive: true });
await writeFile("reports/bgeometrics-vergleich.md", md);
await writeJSON("reports/bgeometrics-vergleich.json", {
  erstellt: new Date().toISOString(), config_version: cfg.version,
  gegenprobe: gegenprobe.map(({ id, name, stat, fehlt }) => ({ id, name, stat, fehlt })),
  varianten: [ohne, nurSth, mit].map((v) => ({ label: v.label, wert: v.wert, btc: v.sim.btc, cash: v.sim.cash,
    trades: v.sim.trades.length, erfuellt: v.erfuellt, phase: v.last.phase })),
}, { pretty: true });

console.log(md.split("## 2.")[0]);
console.log(`Vollständiger Bericht: reports/bgeometrics-vergleich.md`);
