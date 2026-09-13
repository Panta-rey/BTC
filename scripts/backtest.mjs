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
import { FEE, CORE, SPLIT, MONTHLY, LOWS, HIGHS, simulate, dca, maxDrawdown, assess, tranchesByWeek,
         fmtUSD, fmtBTC, pct } from "./lib/sim.mjs";
import { daysBetween } from "../engine/dates.mjs";

// ---------------------------------------------------------------- Simulation

// ---------------------------------------------------------------- Bewertung

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
    const base = { passed: checks.filter((c) => c.ok).length, value: sim.btc * price + sim.cash };
    L.push("## Empfindlichkeit (±15 %)", "");
    L.push(`Vergleichswert ohne Verschiebung: **${fmtUSD(base.value)} USD**, ${base.passed} von ${checks.length} Kriterien.`, "");
    L.push("Entscheidend ist die Spalte Gesamtvermögen, nicht BTC allein: Wer verkauft hat, hält am Ende weniger BTC, dafür Cash.", "");
    L.push("| Schwelle | Faktor | Gesamtvermögen | gegen Basis | BTC | Cash | Trans. | Kriterien | verloren |",
           "|---|---|---|---|---|---|---|---|---|");
    for (const s of sens) {
      const val = s.btc * price + s.cash;
      const d = base.value ? (val / base.value - 1) * 100 : 0;
      const flag = s.passed < base.passed ? " ⚠" : "";
      L.push(`| \`${s.path}\` | ${s.factor} | ${fmtUSD(val)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)} % | ${fmtBTC(s.btc)} | ${fmtUSD(s.cash)} | ${s.trades} | ${s.passed} von ${s.total}${flag} | ${s.lost.join(", ") || "–"} |`);
    }
    const worst = Math.min(...sens.map((x) => x.passed));
    L.push("", worst >= base.passed - 1
      ? `**Bestanden.** Keine einzelne Verschiebung kostet mehr als ein Kriterium (schlechtester Fall: ${worst} von ${checks.length}).`
      : `**Nicht bestanden.** Im schlechtesten Fall bleiben nur ${worst} von ${checks.length} Kriterien.`, "");
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
const byWeek = tranchesByWeek(run.events);

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
      const s2 = simulate(r.weeks, tranchesByWeek(r.events));
      const ch = assess(r, s2.trades);
      sens.push({ path, factor, btc: s2.btc, cash: s2.cash, trades: s2.trades.length,
        passed: ch.filter((x) => x.ok).length, total: ch.length,
        lost: ch.filter((x) => !x.ok).map((x) => `${x.kind} ${x.date.slice(0, 4)}`) });
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
