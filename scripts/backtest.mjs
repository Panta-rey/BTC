#!/usr/bin/env node
// Panta Rey · Ampel – Backtest (Meilenstein M2)
//
// Spielt die Wochenhistorie mit denselben Funktionen ab wie der Live-Betrieb und
// vergleicht die Strategie "Ampel" mit "Halten" sowie Sparplan mit und ohne Faktor.
// Schreibt reports/backtest.md.
//
// Aufruf:
//   node scripts/backtest.mjs                 normaler Lauf
//   node scripts/backtest.mjs --sensitivity   zusätzlich Schwellen um ±15 % verschieben

import { readJSON, writeJSON } from "./lib/store.mjs";
import { toRows } from "../engine/rows.mjs";
import { replay, PHASE_NAMES } from "../engine/phases.mjs";
import { daysBetween } from "../engine/dates.mjs";

const FEE = 0.005; // 0,5 % pro Transaktion
const CORE = 0.40; // Kernposition, wird nie verkauft
const SPLIT = [0.34, 0.33, 0.33];
const DCA_FACTOR = { 1: 2, 2: 1, 3: 0, 4: 0.5 }; // SPEC 7.4, ohne Score-Bonus
const MONTHLY = 500;

// Bekannte Zyklus-Extreme für die Bewertung (SPEC Anhang A, gerundet)
const LOWS = [["2015-01-14", 172], ["2018-12-15", 3200], ["2022-11-21", 15500]];
const HIGHS = [["2013-12-04", 1150], ["2017-12-17", 19800], ["2021-11-10", 69000], ["2025-10-06", 126000]];

const fmtUSD = (v) => (v == null ? "–" : Math.round(v).toLocaleString("de-CH").replace(/[\u2019\u202F\u00A0]/g, "'"));
const fmtBTC = (v) => (v == null ? "–" : v.toFixed(4));
const pct = (v) => (v == null ? "–" : (v * 100).toFixed(1) + " %");

// ---------------------------------------------------------------- Simulation

function simulate(weeks, byWeek) {
  let btc = 1, cash = 0, core = 0, tradable = 0, cashAtEntry = 0;
  const trades = [];
  const equity = [];
  let prevPhase = null;

  for (const w of weeks) {
    const price = w.close;
    if (price == null) continue;

    // Beim Eintritt in Phase 1 den Kauf-Topf festlegen, in Phase 3 die Kernposition
    if (w.phase === 1 && prevPhase !== 1) cashAtEntry = cash;
    if (w.phase === 3 && prevPhase !== 3) { core = btc * CORE; tradable = btc - core; }

    for (const [i, t] of ["B1", "B2", "B3"].entries()) {
      if (byWeek[w.w]?.has(t)) {
        const amount = Math.min(cash, cashAtEntry * SPLIT[i]);
        if (amount > 0) {
          const got = (amount * (1 - FEE)) / price;
          cash -= amount; btc += got;
          trades.push({ w: w.w, t, side: "kauf", price, usd: amount, btc: got });
        }
      }
    }
    for (const [i, t] of ["S1", "S2", "S3"].entries()) {
      if (byWeek[w.w]?.has(t)) {
        const qty = Math.min(btc - core, tradable * SPLIT[i]);
        if (qty > 0) {
          const usd = qty * price * (1 - FEE);
          btc -= qty; cash += usd;
          trades.push({ w: w.w, t, side: "verkauf", price, usd, btc: qty });
        }
      }
    }
    equity.push({ w: w.w, value: btc * price + cash, btc, cash });
    prevPhase = w.phase;
  }
  return { btc, cash, trades, equity };
}

function dca(weeks, withFactor) {
  let btc = 0, invested = 0, cash = 0, lastMonth = null;
  for (const w of weeks) {
    const m = w.w.slice(0, 7);
    if (m === lastMonth || w.close == null) continue;
    lastMonth = m;
    const f = withFactor ? DCA_FACTOR[w.phase] ?? 1 : 1;
    const budget = MONTHLY * f;
    const avail = MONTHLY + cash;
    const spend = Math.min(budget, avail);
    cash = avail - spend;
    invested += MONTHLY;
    btc += (spend * (1 - FEE)) / w.close;
  }
  return { btc, cash, invested };
}

const maxDrawdown = (equity) => {
  let peak = -Infinity, worst = 0;
  for (const e of equity) { if (e.value > peak) peak = e.value; worst = Math.min(worst, e.value / peak - 1); }
  return worst;
};

// ---------------------------------------------------------------- Bewertung

function nearest(trades, side, target) {
  const c = trades.filter((t) => t.side === side);
  if (!c.length) return null;
  return c.reduce((best, t) => (Math.abs(daysBetween(t.w, target)) < Math.abs(daysBetween(best.w, target)) ? t : best));
}

function assess(run, trades) {
  const out = [];
  for (const [date, price] of LOWS) {
    const entry = run.weeks.find((w) => w.phase === 1 && w.w >= date.slice(0, 4) + "-01-01" && Math.abs(daysBetween(w.w, date)) < 250);
    const buys = trades.filter((t) => t.side === "kauf" && Math.abs(daysBetween(t.w, date)) < 300);
    const avg = buys.length ? buys.reduce((s, t) => s + t.price * t.usd, 0) / buys.reduce((s, t) => s + t.usd, 0) : null;
    out.push({
      kind: "Tief", date, price,
      phase_week: entry?.w ?? null,
      offset_weeks: entry ? Math.round(daysBetween(date, entry.w) / 7) : null,
      avg, ratio: avg ? avg / price : null, target: "≤ 1,6 ×", ok: avg ? avg / price <= 1.6 : false,
      trades: buys.length,
    });
  }
  for (const [date, price] of HIGHS) {
    const sells = trades.filter((t) => t.side === "verkauf" && Math.abs(daysBetween(t.w, date)) < 300);
    const avg = sells.length ? sells.reduce((s, t) => s + t.price * t.btc, 0) / sells.reduce((s, t) => s + t.btc, 0) : null;
    out.push({
      kind: "Hoch", date, price, phase_week: null,
      offset_weeks: sells.length ? Math.round(daysBetween(date, sells[0].w) / 7) : null,
      avg, ratio: avg ? avg / price : null, target: "≥ 0,6 ×", ok: avg ? avg / price >= 0.6 : false,
      trades: sells.length,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Diagnose

// Warum hat die Maschine an einem bekannten Extrem (nicht) reagiert?
// Zeigt die Woche selbst und die beste Woche im Fenster von ±26 Wochen.
function diagnose(run, side, date) {
  const near = run.weeks.filter((w) => Math.abs(daysBetween(w.w, date)) <= 182);
  if (!near.length) return null;
  const key = side === "buy" ? "buy" : "sell";
  const at = near.reduce((b, w) => (Math.abs(daysBetween(w.w, date)) < Math.abs(daysBetween(b.w, date)) ? w : b));
  const best = near.reduce((b, w) => ((w[key] ?? -1) > (b[key] ?? -1) ? w : b));
  const fam = (w) => Object.fromEntries(Object.entries(w.engines[key].families).map(([k, v]) => [k, v.available ? v.score : null]));
  return {
    at: { w: at.w, score: at[key], cov: at[key + "_cov"], phase: at.phase, gaps: at.flags.data_gap, gates: at.gates,
          conf: at.engines[key].confluence, fam: fam(at), cycle_days: at.cycle_days },
    best: { w: best.w, score: best[key], cov: best[key + "_cov"], gaps: best.flags.data_gap, gates: best.gates, fam: fam(best) },
    gapWeeks: near.filter((w) => w.flags.data_gap).length,
    n: near.length,
  };
}

function diagnosticsSection(run) {
  const L = ["## Diagnose an den bekannten Extremen", "",
    "| Extrem | Datum | nächste Woche | Score | Abdeckung | Gates | stärkste Woche | Score |",
    "|---|---|---|---|---|---|---|---|",
    ...[["Tief", LOWS, "buy"], ["Hoch", HIGHS, "sell"]].flatMap(([kind, list, side]) =>
      list.map(([date]) => {
        const d = diagnose(run, side, date);
        if (!d) return `| ${kind} | ${date} | – | – | – | – | – | – |`;
        const g = Object.entries(d.at.gates).filter(([k]) => (side === "buy" ? "AB" : "E").includes(k[0]))
          .map(([k, v]) => `${k}=${v ? "✓" : "✗"}`).join(" ");
        return `| ${kind} | ${date} | ${d.at.w} | ${d.at.score ?? "–"} | ${pct(d.at.cov)} | ${g} | ${d.best.w} | ${d.best.score ?? "–"} |`;
      })),
    "",
    "Für jedes Extrem: die nächstgelegene Woche und die stärkste Woche im Fenster von ±26 Wochen. `cov` ist die Abdeckung des jeweiligen Motors, `gaps` die Zahl der Wochen mit Datenlücke im Fenster.", ""];
  for (const [kind, list, side] of [["Tief", LOWS, "buy"], ["Hoch", HIGHS, "sell"]]) {
    for (const [date, price] of list) {
      const d = diagnose(run, side, date);
      L.push(`### ${kind} ${date} (${fmtUSD(price)} USD)`, "");
      if (!d) { L.push("Keine Daten im Fenster.", ""); continue; }
      L.push(`| | Woche | Score | Abdeckung | Phase | Gates | Familien |`, "|---|---|---|---|---|---|---|");
      const g = (x) => Object.entries(x).filter(([k]) => (side === "buy" ? "AB" : "E").includes(k[0])).map(([k, v]) => `${k}=${v ? "✓" : "✗"}`).join(" ");
      L.push(`| nächstgelegen | ${d.at.w} | ${d.at.score ?? "–"} | ${pct(d.at.cov)} | ${d.at.phase} | ${g(d.at.gates)} | ${JSON.stringify(d.at.fam)} |`);
      L.push(`| stärkste | ${d.best.w} | ${d.best.score ?? "–"} | ${pct(d.best.cov)} | | ${g(d.best.gates)} | ${JSON.stringify(d.best.fam)} |`);
      L.push("", `Konvergenz in der nächstgelegenen Woche: ${d.at.conf.in_zone} Indikatoren in Zone aus ${d.at.conf.families} Familien (${d.at.conf.available_families} verfügbar). Zyklus-Uhr: ${d.at.cycle_days ?? "–"} Tage. Wochen mit Datenlücke im Fenster: ${d.gapWeeks} von ${d.n}.`, "");
    }
  }
  return L;
}

// ---------------------------------------------------------------- Empfindlichkeit

function shift(cfg, path, factor) {
  const c = structuredClone(cfg);
  const parts = path.split(".");
  let o = c;
  for (const p of parts.slice(0, -1)) o = o[p];
  const k = parts.at(-1);
  o[k] = typeof o[k] === "number" ? o[k] * factor : o[k];
  return c;
}

const SENSITIVE = ["engines.buy.zone_min_score", "engines.sell.zone_min_score",
                   "gates.buy_B.drawdown_max", "gates.sell_E2.halving_days_min", "gates.sell_E2.score_min"];

// ---------------------------------------------------------------- Report

function report(run, sim, trades, dcaPlain, dcaFactor, checks, sens, rows, cfg) {
  const last = run.weeks.at(-1);
  const price = last.close;
  const hold = { btc: 1, value: price };
  const L = [];
  L.push("# Backtest", "");
  L.push(`Konfiguration \`${cfg.version}\` · ${run.weeks.length} Wochen ab ${run.weeks[0].w} bis ${last.w} · Gebühr ${(FEE * 100).toFixed(1)} % pro Transaktion · Kernposition ${Math.round(CORE * 100)} %`, "");
  L.push("> Startkapital: 1 BTC, kein Cash. Kauftranchen vor dem ersten Verkauf sind deshalb nicht finanzierbar – das betrifft das Tief 2015. Für Tiefs zählt daher vor allem der Zeitpunkt des Phaseneintritts.", "");
  L.push("> Ohne Steuern. Ausführung zum Wochenschluss der Signalwoche. Die BGeometrics-Kennzahlen fehlen (SPEC 3.4), der STH-Realized-Price war historisch nicht verfügbar, deshalb arbeitet der Trendfilter nur mit dem Bull Market Support Band.", "");

  L.push("## Ergebnis", "");
  L.push("| Strategie | BTC am Ende | Cash | Wert | Grösster Rückgang | Transaktionen |", "|---|---|---|---|---|---|");
  L.push(`| Halten | ${fmtBTC(hold.btc)} | – | ${fmtUSD(hold.value)} | – | 0 |`);
  L.push(`| Ampel | ${fmtBTC(sim.btc)} | ${fmtUSD(sim.cash)} | ${fmtUSD(sim.btc * price + sim.cash)} | ${pct(maxDrawdown(sim.equity))} | ${trades.length} |`);
  L.push(`| Sparplan | ${fmtBTC(dcaPlain.btc)} | ${fmtUSD(dcaPlain.cash)} | ${fmtUSD(dcaPlain.btc * price + dcaPlain.cash)} | – | ${Math.round(dcaPlain.invested / MONTHLY)} |`);
  L.push(`| Sparplan mit Faktor | ${fmtBTC(dcaFactor.btc)} | ${fmtUSD(dcaFactor.cash)} | ${fmtUSD(dcaFactor.btc * price + dcaFactor.cash)} | – | ${Math.round(dcaFactor.invested / MONTHLY)} |`);
  L.push("", `Ampel gegen Halten: ${sim.btc >= 1 ? "✓" : "✗"} ${(sim.btc).toFixed(4)} BTC statt 1,0000 BTC (plus ${fmtUSD(sim.cash)} Cash).`, "");

  L.push("## Abnahmekriterien (SPEC 10.3)", "");
  L.push("| Ereignis | Datum | Kurs | Phase-Eintritt | Abstand | Ø Preis | Verhältnis | Ziel | |", "|---|---|---|---|---|---|---|---|---|");
  for (const c of checks) {
    L.push(`| ${c.kind} | ${c.date} | ${fmtUSD(c.price)} | ${c.phase_week ?? "–"} | ${c.offset_weeks == null ? "–" : c.offset_weeks + " W"} | ${fmtUSD(c.avg)} | ${c.ratio ? c.ratio.toFixed(2) + " ×" : "–"} | ${c.target} | ${c.ok ? "✓" : "✗"} |`);
  }
  L.push("");

  L.push(...diagnosticsSection(run));

  L.push("## Phasen", "");
  L.push("| Von | Bis | Phase | Wochen | Kurs Anfang | Kurs Ende |", "|---|---|---|---|---|---|");
  let start = run.weeks[0], prev = run.weeks[0];
  for (const w of run.weeks.slice(1).concat([null])) {
    if (!w || w.phase !== prev.phase) {
      L.push(`| ${start.w} | ${prev.w} | ${prev.phase} ${PHASE_NAMES[prev.phase]} | ${Math.round(daysBetween(start.w, prev.w) / 7) + 1} | ${fmtUSD(start.close)} | ${fmtUSD(prev.close)} |`);
      start = w;
    }
    if (!w) break;
    prev = w;
  }
  L.push("");

  L.push("## Transaktionen", "");
  if (!trades.length) L.push("Keine.");
  else {
    L.push("| Woche | Tranche | Seite | Kurs | Betrag | BTC |", "|---|---|---|---|---|---|");
    for (const t of trades) L.push(`| ${t.w} | ${t.t} | ${t.side} | ${fmtUSD(t.price)} | ${fmtUSD(t.usd)} | ${fmtBTC(t.btc)} |`);
  }
  L.push("");

  L.push("## Signale", "");
  const byType = {};
  for (const e of run.events) byType[e.type] = (byType[e.type] || 0) + 1;
  L.push("| Typ | Anzahl |", "|---|---|");
  for (const [k, v] of Object.entries(byType)) L.push(`| ${k} | ${v} |`);
  L.push("");

  L.push("## Datenabdeckung", "");
  L.push("| Jahr | Ø Abdeckung Kauf | Ø Abdeckung Verkauf | Wochen mit Datenlücke |", "|---|---|---|---|");
  const byYear = {};
  for (const w of run.weeks) {
    const y = w.w.slice(0, 4);
    (byYear[y] ??= { b: [], s: [], gap: 0 });
    byYear[y].b.push(w.buy_cov); byYear[y].s.push(w.sell_cov);
    if (w.flags.data_gap) byYear[y].gap++;
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  for (const [y, v] of Object.entries(byYear)) L.push(`| ${y} | ${pct(avg(v.b))} | ${pct(avg(v.s))} | ${v.gap} |`);
  L.push("");

  if (sens) {
    L.push("## Empfindlichkeit (±15 %)", "");
    L.push("| Schwelle | Faktor | BTC am Ende | Transaktionen | Kriterien erfüllt |", "|---|---|---|---|---|");
    for (const s of sens) L.push(`| \`${s.path}\` | ${s.factor} | ${fmtBTC(s.btc)} | ${s.trades} | ${s.passed} von ${s.total} |`);
    L.push("");
  }

  // Laufender Zyklus: Wie nah war die Maschine seit dem letzten Phasenwechsel am nächsten Schritt?
  const sincePhase = run.weeks.filter((w) => w.w >= run.state.phase_since);
  const side = last.active;
  const bestNow = sincePhase.reduce((b, w) => ((w[side] ?? -1) > (b[side] ?? -1) ? w : b), sincePhase[0]);
  L.push("## Laufender Abschnitt", "");
  L.push(`Phase ${last.phase} ${PHASE_NAMES[last.phase]} seit ${run.state.phase_since} (${sincePhase.length} Wochen). Aktiver Motor: ${side === "buy" ? "Kauf" : "Verkauf"}.`, "");
  L.push("| | Woche | Kurs | Score | Gates | Familien |", "|---|---|---|---|---|---|");
  const gs = (x) => Object.entries(x).filter(([k]) => (side === "buy" ? "AB" : "E").includes(k[0]) && k !== "e2_min").map(([k, v]) => `${k}=${v ? "✓" : "✗"}`).join(" ");
  const famOf = (w) => JSON.stringify(Object.fromEntries(Object.entries(w.engines[side].families).map(([k, v]) => [k, v.available ? v.score : null])));
  L.push(`| stärkste Woche | ${bestNow.w} | ${fmtUSD(bestNow.close)} | ${bestNow[side]} | ${gs(bestNow.gates)} | ${famOf(bestNow)} |`);
  L.push(`| jetzt | ${last.w} | ${fmtUSD(last.close)} | ${last[side]} | ${gs(last.gates)} | ${famOf(last)} |`);
  L.push("", "Bedingungen für den nächsten Schritt:", "");
  L.push("| Bedingung | aktuell | Ziel | |", "|---|---|---|---|");
  for (const c of last.conditions) L.push(`| ${c.label} | ${typeof c.value === "number" ? fmtUSD(c.value) : c.value} | ${typeof c.target === "number" ? fmtUSD(c.target) : c.target} | ${c.met ? "✓" : "✗"} |`);
  L.push("");

  L.push("## Aktueller Stand", "");
  L.push(`Phase ${last.phase} ${PHASE_NAMES[last.phase]} seit ${run.state.phase_since} · Kauf-Motor ${last.buy} · Verkauf-Motor ${last.sell} · Zähler ${last.counter} von ${cfg.confirm_weeks}`);
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------- Ablauf

const weekly = await readJSON("data/weekly.json");
if (!weekly) { console.error("data/weekly.json fehlt. Zuerst scripts/fetch.mjs und scripts/build.mjs ausführen."); process.exit(1); }
const cfg = await readJSON("config/engine.json");
const rows = toRows(weekly);

const run = replay(rows, cfg);
const byWeek = {};
for (const e of run.events) if (e.tranche) (byWeek[e.week_id] ??= new Set()).add(e.tranche);
for (const e of run.events) if (e.tranches) for (const t of e.tranches) (byWeek[e.week_id] ??= new Set()).add(t);

const sim = simulate(run.weeks, byWeek);
const checks = assess(run, sim.trades);
const dcaPlain = dca(run.weeks, false);
const dcaFactor = dca(run.weeks, true);

let sens = null;
if (process.argv.includes("--sensitivity")) {
  sens = [];
  for (const path of SENSITIVE) {
    for (const factor of [0.85, 1.15]) {
      const c = shift(cfg, path, factor);
      const r = replay(toRows(weekly), c);
      const bw = {};
      for (const e of r.events) { if (e.tranche) (bw[e.week_id] ??= new Set()).add(e.tranche); if (e.tranches) for (const t of e.tranches) (bw[e.week_id] ??= new Set()).add(t); }
      const s2 = simulate(r.weeks, bw);
      const ch = assess(r, s2.trades);
      sens.push({ path, factor, btc: s2.btc, trades: s2.trades.length, passed: ch.filter((x) => x.ok).length, total: ch.length });
    }
  }
}

const md = report(run, sim, sim.trades, dcaPlain, dcaFactor, checks, sens, rows, cfg);
await writeJSON("reports/backtest.json", { schema: 1, config_version: cfg.version, generated_at: new Date().toISOString(), trades: sim.trades, checks, final: { btc: sim.btc, cash: sim.cash } }, { pretty: true });
const { writeFile, mkdir } = await import("node:fs/promises");
await mkdir("reports", { recursive: true });
await writeFile("reports/backtest.md", md);

console.log(md.split("## Phasen")[0]);
console.log(`Vollständiger Bericht: reports/backtest.md (${run.events.length} Signale, ${sim.trades.length} Transaktionen)`);
