// Simulation und Bewertung für den Backtest. Rein funktional, ohne Netzwerk,
// damit sie sowohl im Repo-Backtest als auch in lokalen Vergleichen läuft.

import { daysBetween } from "../../engine/dates.mjs";

export const FEE = 0.005; // 0,5 % pro Transaktion
export const CORE = 0.40; // Kernposition, wird nie verkauft
export const SPLIT = [0.34, 0.33, 0.33];
export const DCA_FACTOR = { 1: 2, 2: 1, 3: 0, 4: 0.5 }; // SPEC 7.4, ohne Score-Bonus
export const MONTHLY = 500;

// Bekannte Zyklus-Extreme für die Bewertung (SPEC Anhang A, gerundet)
export const LOWS = [["2015-01-14", 172], ["2018-12-15", 3200], ["2022-11-21", 15500]];
export const HIGHS = [["2013-12-04", 1150], ["2017-12-17", 19800], ["2021-11-10", 69000], ["2025-10-06", 126000]];

export const fmtUSD = (v) => (v == null ? "–" : Math.round(v).toLocaleString("de-CH").replace(/[\u2019\u202F\u00A0]/g, "'"));
export const fmtBTC = (v) => (v == null ? "–" : v.toFixed(4));
export const pct = (v) => (v == null ? "–" : (v * 100).toFixed(1) + " %");


// ---------------------------------------------------------------- Simulation

export function simulate(weeks, byWeek) {
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

export function dca(weeks, withFactor) {
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


export const maxDrawdown = (equity) => {
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

export function assess(run, trades) {
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


// Die Tranchen je Woche aus den Ereignissen der Wiedergabe ziehen.
export function tranchesByWeek(events) {
  const out = {};
  for (const e of events) {
    if (e.tranche) (out[e.week_id] ??= new Set()).add(e.tranche);
    if (e.tranches) for (const t of e.tranches) (out[e.week_id] ??= new Set()).add(t);
  }
  return out;
}
