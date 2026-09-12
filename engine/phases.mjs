// Phasenmaschine (SPEC 6). Spielt die Wochenhistorie ab und leitet Phase, Tranchen und Events ab.
// Der Ablauf ist die Wahrheit: state.json und events.json sind Ausgaben, keine Eingaben.

import { scoreIndicators, engineScore, confluenceOk, gates, zoneName } from "./engines.mjs";
import { daysBetween } from "./dates.mjs";

export const PHASE_NAMES = { 1: "Akkumulation", 2: "Aufwärtstrend", 3: "Verteilung", 4: "Abwärtstrend" };
const NEXT_PHASE = { 1: 2, 2: 3, 3: 4, 4: 1 };
const TRANSITION_LABEL = { 4: "Kaufzone", 1: "Tief bestätigt", 2: "Top-Zone", 3: "Trendbruch" };

const weeksBetween = (a, b) => Math.round(daysBetween(a, b) / 7);

// Bedingungen für den nächsten Übergang, einzeln nachvollziehbar für die Checkliste der Seite.
function transitionConditions(phase, ctx) {
  const { row, buy, sell, g, cfg } = ctx;
  const f = (label, value, target, met, unit = "") => ({ label, value, target, met: !!met, unit });

  if (phase === 4) {
    const c = confluenceOk(buy, cfg.engines.buy.confluence);
    return [
      f("Gate A oder B erfüllt", g.A ? "A" : g.B ? "B" : "keines", "A oder B", g.A || g.B),
      f("Kauf-Score", buy.score, cfg.engines.buy.zone_min_score, buy.score != null && buy.score >= cfg.engines.buy.zone_min_score),
      f("Indikatoren in Zone", buy.confluence.in_zone, c.need_indicators, buy.confluence.in_zone >= c.need_indicators),
      f("davon Familien", buy.confluence.families, c.need_families, buy.confluence.families >= c.need_families),
    ];
  }
  if (phase === 1) {
    return [
      f("Wochenschluss über Bandoberkante", row.close, row.bmsb_hi, row.bmsb_hi != null && row.close > row.bmsb_hi, "USD"),
      f("Wochenschluss über STH-Einstand", row.close, row.sth_rp, row.sth_rp == null || row.close > row.sth_rp, "USD"),
    ];
  }
  if (phase === 2) {
    return [
      f("Weg E1 (Überhitzung)", g.E1 ? "erfüllt" : "offen", "erfüllt", g.E1),
      f("Weg E2 (Zeitfenster)", g.E2 ? "erfüllt" : "offen", "erfüllt", g.E2),
      f("Verkauf-Score", sell.score, cfg.gates.sell_E2.score_min, sell.score != null && sell.score >= cfg.gates.sell_E2.score_min),
    ];
  }
  return [
    f("Wochenschluss unter Bandunterkante", row.close, row.bmsb_lo, row.bmsb_lo != null && row.close < row.bmsb_lo, "USD"),
    f("Wochenschluss unter STH-Einstand", row.close, row.sth_rp, row.sth_rp == null || row.close < row.sth_rp, "USD"),
  ];
}

function transitionMet(phase, ctx) {
  const { row, buy, g, cfg } = ctx;
  switch (phase) {
    case 4: // → Akkumulation
      return (g.A || g.B) && buy.score != null && buy.score >= cfg.engines.buy.zone_min_score &&
             confluenceOk(buy, cfg.engines.buy.confluence).ok;
    case 1: // → Aufwärtstrend: Tief bestätigt
      return row.bmsb_hi != null && row.close > row.bmsb_hi && (row.sth_rp == null || row.close > row.sth_rp);
    case 2: // → Verteilung: Top-Zone
      return g.E1 || g.E2;
    case 3: // → Abwärtstrend: Trendbruch
      return row.bmsb_lo != null && row.close < row.bmsb_lo && (row.sth_rp == null || row.close < row.sth_rp);
  }
}

// Relevantes Halving (SPEC 6.2): erstes Halving nach Beginn des aktuellen Zyklus.
function relevantHalving(cycleStart, w, halvings) {
  if (!cycleStart) return null;
  const h = halvings.find((x) => x >= cycleStart && x <= w);
  return h || null;
}

export function replay(rows, cfg, opts = {}) {
  const startWeek = opts.startWeek || cfg.bootstrap.start_week;
  const st = {
    phase: cfg.bootstrap.start_phase, phase_since: startWeek, cycle_start: null,
    relevant_halving: null, counter: 0,
    tranches: { B1: null, B2: null, B3: null, S1: null, S2: null, S3: null },
    reserve_cooldown_until: null, last_week_id: null, cycle_no: 0,
  };
  const events = [];
  const weeks = [];
  const history = [];
  let lastGoodWeek = null;

  const add = (w, type, text, extra = {}) => {
    const id = `${w}:${type}${extra.tranche ? ":" + extra.tranche : ""}`;
    events.push({ id, week_id: w, type, text, phase: st.phase, config_version: cfg.version, ...extra });
  };

  for (const row of rows) {
    if (row.w < startWeek) { history.push(row); continue; }

    const cycleHalving = relevantHalving(st.cycle_start, row.w, cfg.halvings);
    const cycleDays = cycleHalving ? daysBetween(cycleHalving, row.w) : null;
    row.cycle_days = cycleDays;

    const scores = scoreIndicators(row, history, cfg);
    const buy = engineScore(scores, cfg.engines.buy, "buy");
    const sell = engineScore(scores, cfg.engines.sell, "sell");
    const g = gates(row, scores, cfg, buy, sell, cycleDays);
    const ctx = { row, scores, buy, sell, g, cfg };

    const activeSide = st.phase === 1 || st.phase === 4 ? "buy" : "sell";
    const active = activeSide === "buy" ? buy : sell;

    // Datenlücke (SPEC 6.6): Zähler bleiben stehen, keine Auswertung.
    const dataGap = active.score == null || active.coverage < cfg.zone_min_coverage;
    if (dataGap) {
      if (lastGoodWeek && weeksBetween(lastGoodWeek, row.w) === 2) add(row.w, "DATA_GAP", "Seit zwei Wochen unvollständige Daten. Quellen prüfen.");
      weeks.push(snapshot(row, st, buy, sell, g, scores, ctx, { data_gap: true }));
      history.push(row);
      continue;
    }
    lastGoodWeek = row.w;

    // Übergang prüfen: zwei Wochenschlüsse in Folge (SPEC 6.3)
    const met = transitionMet(st.phase, ctx);
    const prevCounter = st.counter;
    st.counter = met ? st.counter + 1 : 0;
    if (met && prevCounter === 0 && cfg.confirm_weeks > 1) {
      add(row.w, "COUNTER", `${TRANSITION_LABEL[st.phase]} diese Woche erreicht. Bestätigt sie sich am nächsten Wochenschluss, wechselt die Phase.`);
    }

    const flags = { data_gap: false };
    if (st.counter >= cfg.confirm_weeks) {
      const from = st.phase;
      st.phase = NEXT_PHASE[from];
      st.phase_since = row.w;
      st.counter = 0;
      if (st.phase === 1) {
        st.cycle_start = row.w;
        st.cycle_no++;
        st.tranches = { B1: null, B2: null, B3: null, S1: null, S2: null, S3: null };
      }
      st.relevant_halving = relevantHalving(st.cycle_start, row.w, cfg.halvings);
      // Der Trendbruch bekommt eine eigene Meldung, sonst die allgemeine Phasenmeldung.
      if (from === 3) {
        const open = ["S1", "S2", "S3"].filter((t) => !st.tranches[t]);
        for (const t of open) st.tranches[t] = row.w;
        add(row.w, "TREND_BREAK", open.length
          ? `Trendbruch bestätigt. ${open.length} offene Verkaufstranche(n) fällig. Kernposition behalten.`
          : "Trendbruch bestätigt. Alle Verkaufstranchen waren bereits ausgelöst. Kernposition behalten.",
          { from, to: st.phase, tranches: open });
      } else {
        add(row.w, "PHASE_CHANGE", `Phase ${st.phase} ${PHASE_NAMES[st.phase]} hat begonnen.`, { from, to: st.phase });
      }

      if (st.phase === 1) { st.tranches.B1 = row.w; add(row.w, "TRANCHE_DUE", "Kauftranche 1 von 3 fällig.", { tranche: "B1" }); }
      if (st.phase === 2 && !st.tranches.B3) {
        const also = !st.tranches.B2 ? " (Tranche 2 wird mit eingerechnet)" : "";
        st.tranches.B3 = row.w;
        if (!st.tranches.B2) st.tranches.B2 = row.w;
        add(row.w, "TRANCHE_DUE", `Kauftranche 3 von 3 fällig${also}. Tief bestätigt.`, { tranche: "B3" });
      }
      flags.phase_changed = true;
    } else {
      // Tranchen innerhalb der Phase (SPEC 6.4) – nur ein Wochenschluss nötig
      const t = cfg.tranches;
      if (st.phase === 1 && st.tranches.B1 && !st.tranches.B2) {
        const wks = weeksBetween(st.tranches.B1, row.w);
        const met2 = wks >= t.b2_min_weeks && ((g.A || g.B) || buy.score >= t.b2_score_min);
        if (met2 || wks >= t.b2_max_weeks) {
          st.tranches.B2 = row.w;
          add(row.w, "TRANCHE_DUE", `Kauftranche 2 von 3 fällig${wks >= t.b2_max_weeks && !met2 ? " (Zeitstaffelung)" : ""}.`, { tranche: "B2" });
        }
      }
      if (st.phase === 3) {
        for (const [key, min] of [["S1", t.s1_score], ["S2", t.s2_score], ["S3", t.s3_score]]) {
          if (st.tranches[key]) continue;
          const prev = key === "S1" ? null : st.tranches[key === "S2" ? "S1" : "S2"];
          if (key !== "S1" && (!prev || weeksBetween(prev, row.w) < t.s_min_gap_weeks)) break;
          if (sell.score >= min) {
            st.tranches[key] = row.w;
            add(row.w, "TRANCHE_DUE", `Verkaufstranche ${key[1]} von 3 fällig (Verkauf-Score ${sell.score}).`, { tranche: key });
          }
          break; // immer nur die nächste offene Tranche prüfen
        }
      }
    }

    // Hinweise und Sonderfälle (SPEC 6.5)
    const a = cfg.alerts;
    if (st.phase === 2 && buy.score != null && buy.score >= a.buy_in_uptrend) {
      flags.alert = "buy_in_uptrend";
      add(row.w, "RESERVE", `Ausserordentliche Kaufgelegenheit: Kauf-Score ${buy.score} im Aufwärtstrend. Reserve einsetzbar.`);
    } else if (st.phase === 2 && reserveChance(row, cfg, st)) {
      flags.reserve_chance = true;
      st.reserve_cooldown_until = addWeeks(row.w, cfg.reserve_chance.cooldown_weeks);
      add(row.w, "RESERVE", "Nachkauf-Chance im Aufwärtstrend: halbe Reserve einsetzbar.");
    }
    if ((st.phase === 4 || st.phase === 1) && sell.score != null && sell.score >= a.sell_in_bear) {
      flags.alert = "sell_in_bear";
      add(row.w, "ALERT", `Verkauf-Score ${sell.score} in Phase ${st.phase}. Keine Aktion, zur Information.`);
    }
    if (buy.score != null && sell.score != null && buy.score >= a.unclear_min && sell.score >= a.unclear_min &&
        Math.abs(buy.score - sell.score) < a.unclear_gap) flags.unclear = true;
    if (st.phase === 2 && cycleDays != null && cycleDays > cfg.cycle_anomaly_days) flags.cycle_anomaly = true;

    st.last_week_id = row.w;
    weeks.push(snapshot(row, st, buy, sell, g, scores, ctx, flags));
    history.push(row);
  }

  return { state: st, events, weeks };
}

function addWeeks(w, n) {
  const d = new Date(Date.parse(w + "T00:00:00Z") + n * 7 * 86400000);
  return d.toISOString().slice(0, 10);
}

function reserveChance(row, cfg, st) {
  const c = cfg.reserve_chance;
  if (st.reserve_cooldown_until && row.w < st.reserve_cooldown_until) return false;
  if (row.dd_52w == null || row.dd_52w > -c.drawdown_52w_min) return false;
  if (row.sth_rp != null && row.close > row.sth_rp * c.sth_factor) return false;
  if (row.sth_rp == null) return false; // ohne STH-Einstand kein Nachkauf-Signal
  return row.fng_w != null && row.fng_w <= c.fng_max;
}

function snapshot(row, st, buy, sell, g, scores, ctx, flags) {
  const activeSide = st.phase === 1 || st.phase === 4 ? "buy" : "sell";
  return {
    w: row.w, close: row.close, phase: st.phase, counter: st.counter,
    cycle_no: st.cycle_no, cycle_days: row.cycle_days,
    buy: buy.score, sell: sell.score,
    buy_cov: Math.round(buy.coverage * 100) / 100, sell_cov: Math.round(sell.coverage * 100) / 100,
    active: activeSide, gates: g, flags,
    conditions: flags.data_gap ? [] : transitionConditions(st.phase, ctx),
    tranches: { ...st.tranches },
    engines: { buy, sell }, scores,
  };
}

export { transitionConditions, zoneName };
