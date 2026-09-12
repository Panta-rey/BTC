// Die zwei Motoren (SPEC 5): Kauf und Verkauf werden getrennt berechnet.
// Eingabe ist eine Wochenzeile plus die Wochen davor (für Perzentile). Kein Blick in die Zukunft.

import { score as normScore, percentile, anchorScore } from "./normalize.mjs";
import { daysBetween } from "./dates.mjs";

// Indikatoren, die nicht über Anker laufen, sondern über eine Regel.
const RULE_INDICATORS = new Set(["hash_ribbons"]);

// Welche Perzentile gebraucht werden. Schlüssel = Indikator, Wert = Feld in der Wochenzeile.
const PCT_FIELDS = {
  mvrv_z: "mvrv_z", mayer: "mayer", reserve_risk: "reserve_risk",
  rhodl: "rhodl", lth_dist: "lth_dist", retail_attention: "wiki_4w",
};

// Rohwert eines Indikators aus der Wochenzeile holen.
function rawValue(row, id) {
  switch (id) {
    case "retail_attention": return row.wiki_4w;
    // Steht das relevante Halving noch aus, steht die Zyklus-Uhr auf 0 (SPEC 6.2).
    // Wichtig: 0, nicht "fehlt" – sonst fiele die Familie "Zeit & Trend" ganz aus.
    case "cycle_clock": return row.cycle_days ?? 0;
    default: return row[id] ?? null;
  }
}

// Perzentil über die letzten N Wochen, inklusive der aktuellen.
export function pctOf(id, row, history, cfg) {
  const field = PCT_FIELDS[id];
  if (!field) return null;
  const { window_weeks, min_weeks } = cfg.percentile;
  const win = history.slice(-(window_weeks - 1)).map((r) => r[field]);
  win.push(row[field]);
  const usable = win.filter((v) => v != null);
  if (usable.length < Math.min(min_weeks, window_weeks)) {
    return { value: percentile(usable, row[field]), basis: "kurz", n: usable.length };
  }
  return { value: percentile(usable, row[field]), basis: "voll", n: usable.length };
}

// Hash Ribbons (SPEC 4.3): Kaufsignal in den letzten 8 Wochen = 100, laufende Kapitulation = 60.
function hashRibbonScore(row) {
  if (row.hash_state == null) return null;
  if (row.hash_buy_date && daysBetween(row.hash_buy_date, row.w) <= 56) return 100;
  return row.hash_state === "kapitulation" ? 60 : 0;
}

// Pi Cycle: Kreuzung in den letzten 8 Wochen zählt als 100 (SPEC 4.4).
function piCycleScore(row, history, anchors) {
  const base = anchorScore(anchors.abs, row.pi_cycle);
  const recent = [...history.slice(-8), row];
  const crossed = recent.some((r, i) => i > 0 && r.pi_cycle >= 1 && recent[i - 1].pi_cycle < 1);
  return crossed ? 100 : base;
}

// Alle Indikator-Scores für beide Motoren.
export function scoreIndicators(row, history, cfg) {
  const out = {};
  const ids = new Set([...Object.keys(cfg.anchors.buy), ...Object.keys(cfg.anchors.sell), ...RULE_INDICATORS]);

  for (const id of ids) {
    const value = rawValue(row, id);
    const p = pctOf(id, row, history, cfg);
    const stale = row._stale?.includes(id) ?? false;
    let sBuy = null, sSell = null;

    if (id === "hash_ribbons") sBuy = hashRibbonScore(row);
    else if (id === "pi_cycle") sSell = cfg.anchors.sell.pi_cycle ? piCycleScore(row, history, cfg.anchors.sell.pi_cycle) : null;
    else {
      if (cfg.anchors.buy[id]) sBuy = normScore(cfg.anchors.buy[id], value, p?.value);
      if (cfg.anchors.sell[id]) sSell = normScore(cfg.anchors.sell[id], value, p?.value);
    }

    // Ein "alter" Wert wird angezeigt, zählt aber nicht in den Score (SPEC 3.2).
    if (stale) { sBuy = null; sSell = null; }

    const zone = (s) => (s == null ? "fehlt" : s >= cfg.in_zone_score ? "in_zone" : s >= cfg.near_zone_score ? "nahe" : "neutral");
    out[id] = {
      value: value ?? null,
      pct: p?.value ?? null,
      pct_basis: p?.basis ?? null,
      score_buy: sBuy == null ? null : Math.round(sBuy),
      score_sell: sSell == null ? null : Math.round(sSell),
      state_buy: zone(sBuy),
      state_sell: zone(sSell),
      stale,
      missing: value == null && !RULE_INDICATORS.has(id),
    };
  }
  return out;
}

// Familien- und Motorscore (SPEC 5.2).
export function engineScore(scores, engineCfg, side) {
  const key = side === "buy" ? "score_buy" : "score_sell";
  const stateKey = side === "buy" ? "state_buy" : "state_sell";
  const families = {};
  let sum = 0, weightSum = 0, availableWeight = 0;
  let inZone = 0;
  const zoneFamilies = new Set();
  const zoneIds = [];

  for (const [fid, f] of Object.entries(engineCfg.families)) {
    const totalInner = Object.values(f.members).reduce((a, b) => a + b, 0);
    let innerSum = 0, innerWeight = 0;
    const members = {};
    const zoneHere = [];
    for (const [id, w] of Object.entries(f.members)) {
      const s = scores[id]?.[key];
      members[id] = s ?? null;
      if (s != null) { innerSum += s * w; innerWeight += w; }
      if (scores[id]?.[stateKey] === "in_zone") zoneHere.push(id);
    }
    // Eine Familie zählt nur, wenn mindestens 50 % ihres Innengewichts vorhanden sind.
    const enough = innerWeight >= totalInner * 0.5;
    // Nur Familien, die auch in den Score eingehen, dürfen zur Konvergenz zählen.
    // Sonst wäre die Bedingung leichter zu erfüllen als der Score selbst.
    if (enough && zoneHere.length) { zoneFamilies.add(fid); inZone += zoneHere.length; zoneIds.push(...zoneHere); }
    const fScore = enough ? innerSum / innerWeight : null;
    families[fid] = {
      label: f.label, weight: f.weight, score: fScore == null ? null : Math.round(fScore),
      available: enough, coverage: totalInner ? innerWeight / totalInner : 0, members,
    };
    weightSum += f.weight;
    if (enough) { sum += fScore * f.weight; availableWeight += f.weight; }
  }

  return {
    score: availableWeight ? Math.round(sum / availableWeight) : null,
    coverage: weightSum ? availableWeight / weightSum : 0,
    families,
    confluence: {
      in_zone: inZone,
      families: zoneFamilies.size,
      ids: zoneIds,
      available_families: Object.values(families).filter((f) => f.available).length,
    },
  };
}

// Konvergenz prüfen. Fehlen Familien dauerhaft (SPEC 3.4), sinkt die Anforderung mit,
// damit ein Signal nicht allein daran scheitert, dass eine Quelle fehlt.
export function confluenceOk(eng, cfg) {
  const need = Math.min(cfg.families, Math.max(2, eng.confluence.available_families));
  return {
    ok: eng.confluence.in_zone >= cfg.indicators && eng.confluence.families >= need,
    need_indicators: cfg.indicators,
    need_families: need,
    reduced: need < cfg.families,
  };
}

export function zoneName(score, minScore) {
  if (score == null) return "unbekannt";
  if (score >= 80) return "stark";
  if (score >= minScore) return "aktiv";
  if (score >= 40) return "annaeherung";
  return "ruhig";
}

// Gates (SPEC 5.4). cycleDays = Tage seit dem relevanten Halving, null wenn noch keins.
export function gates(row, scores, cfg, buyEng, sellEng, cycleDays) {
  const g = cfg.gates;
  const mvrvPct = scores.mvrv_z?.pct ?? null;
  const num = (v) => (v == null || !Number.isFinite(v) ? null : v);

  const A = (num(row.mvrv_z) != null && row.mvrv_z < g.buy_A.mvrv_z_max) ||
            (num(row.p_rp) != null && row.p_rp < g.buy_A.p_rp_max);

  // Angebot im Verlust fehlt derzeit; dann entscheidet allein das MVRV-Perzentil (SPEC 3.4).
  const bCheap = (num(row.supply_loss) != null && row.supply_loss >= g.buy_B.supply_loss_min) ||
                 (mvrvPct != null && mvrvPct <= g.buy_B.mvrv_z_pct_max);
  const B = num(row.months_since_ath) != null && row.months_since_ath >= g.buy_B.months_since_ath_min &&
            num(row.drawdown) != null && row.drawdown <= g.buy_B.drawdown_max &&
            num(row.p_200w) != null && row.p_200w <= g.buy_B.p_200w_max && bCheap;

  const E1 = ((cycleDays != null && cycleDays >= g.sell_E1.halving_days_min) ||
              (mvrvPct != null && mvrvPct >= g.sell_E1.mvrv_z_pct_min)) &&
             sellEng.score != null && sellEng.score >= g.sell_E1.score_min &&
             confluenceOk(sellEng, cfg.engines.sell.confluence).ok;
  const E2 = cycleDays != null && cycleDays >= g.sell_E2.halving_days_min &&
             sellEng.score != null && sellEng.score >= g.sell_E2.score_min;

  return { A: !!A, B: !!B, E1: !!E1, E2: !!E2 };
}
