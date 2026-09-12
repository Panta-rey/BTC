// Indikatorwerte aus Tagesreihen berechnen (Meilenstein M1: nur Werte, noch keine Scores).
// Eingabe: lückenloser Tageskalender mit ausgerichteten Arrays. Ausgabe: eine Zeile pro Sonntag.

import { sma, ema, expandingStd, valueAtOrBefore, ratio } from "./series.mjs";
import { weekday, daysBetween } from "./dates.mjs";

export const HALVINGS = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];
export const NEXT_HALVING_HEIGHT = 1_050_000;
export const ONCHAIN_MAX_BACK_DAYS = 10; // Sonntagswert fehlt: bis zu 10 Tage zurück; ab 4 Tagen gilt der Wert als "alt"

// Hash Ribbons: Kapitulation, solange 30-Tage-Schnitt < 60-Tage-Schnitt.
// Kaufsignal: nach mindestens 7 Tagen Kapitulation kreuzt der 30er wieder über den 60er,
// und innerhalb von 60 Tagen danach liegt der 10-Tage-Preisschnitt über dem 20-Tage-Schnitt.
export function hashRibbons(hash, close) {
  const h30 = sma(hash, 30, 25), h60 = sma(hash, 60, 50);
  const p10 = sma(close, 10), p20 = sma(close, 20);
  const state = new Array(hash.length).fill(null);
  const lastBuy = new Array(hash.length).fill(null);
  let capDays = 0, recovery = null, buy = null;
  for (let i = 0; i < hash.length; i++) {
    if (h30[i] != null && h60[i] != null) {
      if (h30[i] < h60[i]) { capDays++; recovery = null; state[i] = "kapitulation"; }
      else {
        if (capDays >= 7) recovery = i;
        capDays = 0;
        state[i] = "normal";
      }
      if (recovery != null && i - recovery <= 60 && p10[i] != null && p20[i] != null && p10[i] > p20[i]) {
        buy = i; recovery = null;
      }
      if (recovery != null && i - recovery > 60) recovery = null;
    }
    lastBuy[i] = buy;
  }
  return { h30, h60, state, lastBuy };
}

export function computeDaily(d) {
  const { close, cm, fng, funding, wiki } = d;
  const n = close.length;

  // Allzeithoch (höchster Tagesschluss bisher)
  const ath = new Array(n).fill(null), athIdx = new Array(n).fill(null);
  let best = -Infinity, bestI = null;
  for (let i = 0; i < n; i++) {
    if (close[i] != null && close[i] > best) { best = close[i]; bestI = i; }
    if (bestI != null) { ath[i] = best; athIdx[i] = bestI; }
  }

  // On-Chain aus Coin Metrics: Realized Cap = Marktkap. ÷ MVRV, Realized Price = Preis ÷ MVRV
  const rc = cm.mc.map((v, i) => ratio(v, cm.mvrv[i]));
  const realized = cm.price.map((v, i) => ratio(v, cm.mvrv[i]));
  const mcStd = expandingStd(cm.mc, 365);
  const mvrvZ = cm.mc.map((v, i) => (v != null && rc[i] != null && mcStd[i] ? (v - rc[i]) / mcStd[i] : null));
  const iss365 = sma(cm.iss, 365, 300);
  const puell = cm.iss.map((v, i) => ratio(v, iss365[i]));

  return {
    ath, athIdx,
    rc, mcStd, iss365,   // Zwischenwerte für die Herkunftsanzeige
    sma200d: sma(close, 200),
    sma111d: sma(close, 111),
    sma350d: sma(close, 350),
    realized, mvrvZ, puell,
    ribbons: hashRibbons(cm.hash, close),
    fng7: sma(fng, 7, 5),
    fng28: sma(fng, 28, 20),
    funding30: sma(funding, 30, 20),
    wiki28: sma(wiki, 28, 20),
  };
}

export function computeWeekly(d, daily) {
  const { dates, close, cm } = d;
  const sundays = [];
  for (let i = 0; i < dates.length; i++) if (weekday(dates[i]) === 0 && close[i] != null) sundays.push(i);

  const wc = sundays.map((i) => close[i]);
  const sma200w = sma(wc, 200);
  const sma20w = sma(wc, 20);
  const ema21w = ema(wc, 21);
  const fngW = sundays.map((i) => daily.fng7[i]);

  return sundays.map((i, k) => {
    const w = dates[i];
    const c = close[i];
    const lo = sma20w[k] != null && ema21w[k] != null ? Math.min(sma20w[k], ema21w[k]) : null;
    const hi = sma20w[k] != null && ema21w[k] != null ? Math.max(sma20w[k], ema21w[k]) : null;

    // On-Chain-Werte vom Sonntag oder bis zu drei Tage davor
    const oc = valueAtOrBefore(cm.mvrv, i, ONCHAIN_MAX_BACK_DAYS);
    const at = (arr) => (oc.index != null ? arr[oc.index] : null);
    const realized = at(daily.realized);

    // Wochen mit extremer Angst in den letzten 8 Wochen (mindestens 6 Wochen Daten nötig)
    const last8 = fngW.slice(Math.max(0, k - 7), k + 1).filter((v) => v != null);
    const fearWeeks = last8.length >= 6 ? last8.filter((v) => v < 25).length : null;

    const lastHalving = [...HALVINGS].reverse().find((h) => h <= w) || null;
    const rb = daily.ribbons;
    const athI = daily.athIdx[i];

    return {
      w,
      close: c,
      ath: daily.ath[i],
      ath_date: athI != null ? dates[athI] : null,
      drawdown: daily.ath[i] ? (c / daily.ath[i] - 1) * 100 : null,
      months_since_ath: athI != null ? daysBetween(dates[athI], w) / 30.44 : null,
      sma200w: sma200w[k],
      p_200w: ratio(c, sma200w[k]),
      sma200d: daily.sma200d[i],
      mayer: ratio(c, daily.sma200d[i]),
      bmsb_lo: lo,
      bmsb_hi: hi,
      bmsb_ext: ratio(c, hi),
      pi_cycle: daily.sma111d[i] != null && daily.sma350d[i] != null ? daily.sma111d[i] / (2 * daily.sma350d[i]) : null,
      onchain_as_of: oc.index != null ? dates[oc.index] : null,
      mvrv: oc.value,
      realized_price: realized,
      p_rp: ratio(c, realized),
      mvrv_z: at(daily.mvrvZ),
      puell: at(daily.puell),
      hash_state: rb.state[i] ?? (oc.index != null ? rb.state[oc.index] : null),
      hash_buy_date: rb.lastBuy[i] != null ? dates[rb.lastBuy[i]] : null,
      fng_w: fngW[k],
      fng_4w: daily.fng28[i],
      fng_fear_weeks: fearWeeks,
      funding_30d: daily.funding30[i],
      wiki_4w: daily.wiki28[i],
      halving_last: lastHalving,
      days_since_halving: lastHalving ? daysBetween(lastHalving, w) : null,
    };
  });
}
