#!/usr/bin/env node
// Panta Rey · Ampel – Wochenauswertung (Meilenstein M1)
//
// Liest data/raw/, bildet den Tageskalender, berechnet alle Indikatorwerte und schreibt:
//   data/weekly.json   eine Zeile pro Sonntag (Historie)
//   data/latest.json   Stand des letzten abgeschlossenen Wochenschlusses
// Motoren, Phasen und Signale (M2) werden aus der vollen Historie neu abgespielt:
// die Wiedergabe ist die Wahrheit, state.json und events.json sind Ausgaben.

import { readJSON, writeJSON } from "./lib/store.mjs";
import { toRows } from "../engine/rows.mjs";
import { replay, PHASE_NAMES } from "../engine/phases.mjs";
import { zoneName, confluenceOk } from "../engine/engines.mjs";
import { DAY, iso, daysBetween, calendar, lastCompletedSunday } from "../engine/dates.mjs";
import { ffill, round } from "../engine/series.mjs";
import { computeDaily, computeWeekly, HALVINGS, NEXT_HALVING_HEIGHT } from "../engine/indicators.mjs";

const RAW = "data/raw";
const NOW = process.env.BUILD_NOW ? Date.parse(process.env.BUILD_NOW) : Date.now();
const MODE = process.env.MODE || "manual";

// Höchstalter in Tagen, gemessen am Wochenschluss (SPEC 3.1).
// Darüber gilt ein Wert als "alt": er wird angezeigt, zählt ab M2 aber nicht in den Score.
const FRESH = { price: 2, onchain: 3, fng: 3, funding: 3, wiki: 7, manual: 30 };

// Kennzahlen, die nur BGeometrics liefert (SPEC 3.4)
const PENDING = {
  supply_loss: "Angebot im Verlust",
  reserve_risk: "Reserve Risk",
  rhodl: "RHODL-Ratio",
  lth_dist: "Abgabe der Langzeithalter",
};

const toMap = (raw) => new Map(raw?.values || []);

async function main() {
  const [bs, cb, cmRaw, fngRaw, wEn, wDe, fundRaw, net, manual, status] = await Promise.all([
    readJSON(`${RAW}/price_bitstamp.json`), readJSON(`${RAW}/price_coinbase.json`),
    readJSON(`${RAW}/coinmetrics.json`), readJSON(`${RAW}/fng.json`),
    readJSON(`${RAW}/wiki_en.json`), readJSON(`${RAW}/wiki_de.json`),
    readJSON(`${RAW}/funding_deribit.json`), readJSON(`${RAW}/network.json`),
    readJSON("data/manual.json", {}), readJSON(`${RAW}/_status.json`, {}),
  ]);
  const sthManual = manual?.sth_realized_price ?? {};
  const sthValue = sthManual.value != null && Number.isFinite(+sthManual.value) ? +sthManual.value : null;
  if (!bs?.values?.length && !cmRaw?.values?.PriceUSD?.length) throw new Error("Keine Preisdaten vorhanden. Zuerst scripts/fetch.mjs ausführen.");

  // ---------------------------------------------------------- Kalender und Preis
  const mBs = toMap(bs), mCb = toMap(cb);
  const cmv = cmRaw?.values || {};
  const mCm = Object.fromEntries(Object.entries(cmv).map(([k, v]) => [k, new Map(v)]));
  const bsFirst = bs?.values?.[0]?.[0] ?? "9999-12-31";
  const first = [cmv.PriceUSD?.[0]?.[0], bs?.values?.[0]?.[0]].filter(Boolean).sort()[0];
  const lastDay = iso(NOW - DAY);
  const dates = calendar(first, lastDay);

  const provenance = { bitstamp: 0, coinbase: 0, coinmetrics_seed: 0, aufgefuellt: 0, fehlt: 0 };
  let close = dates.map((d) => {
    if (mBs.has(d)) { provenance.bitstamp++; return mBs.get(d); }
    if (mCb.has(d)) { provenance.coinbase++; return mCb.get(d); }
    if (d < bsFirst && mCm.PriceUSD?.has(d)) { provenance.coinmetrics_seed++; return mCm.PriceUSD.get(d); }
    return null;
  });
  const filled = ffill(close, 3);
  filled.forEach((v, i) => { if (close[i] == null) provenance[v != null ? "aufgefuellt" : "fehlt"]++; });
  close = filled;

  const col = (map) => dates.map((d) => (map && map.has(d) ? map.get(d) : null));
  const en = toMap(wEn), de = toMap(wDe);
  const input = {
    dates,
    close,
    cm: {
      price: col(mCm.PriceUSD), mc: col(mCm.CapMrktCurUSD), mvrv: col(mCm.CapMVRVCur),
      iss: col(mCm.IssTotUSD), hash: col(mCm.HashRate),
    },
    fng: col(toMap(fngRaw)),
    funding: col(toMap(fundRaw)),
    wiki: dates.map((d) => (en.has(d) ? en.get(d) + (de.get(d) ?? 0) : null)),
  };

  // ---------------------------------------------------------- Berechnung
  const daily = computeDaily(input);
  const weekId = lastCompletedSunday(NOW);
  const rows = computeWeekly(input, daily).filter((r) => r.w <= weekId);
  const row = rows.at(-1);
  if (!row || row.w !== weekId) throw new Error(`Wochenschluss ${weekId} fehlt in den Preisdaten (letzter: ${row?.w ?? "keiner"}).`);

  // ---------------------------------------------------------- weekly.json
  const COLS = [
    ["w"], ["close", 2], ["ath", 2], ["ath_date"], ["drawdown", 2], ["months_since_ath", 2],
    ["sma200w", 2], ["p_200w", 4], ["sma200d", 2], ["mayer", 4],
    ["bmsb_lo", 2], ["bmsb_hi", 2], ["bmsb_ext", 4], ["pi_cycle", 4],
    ["onchain_as_of"], ["mvrv", 4], ["realized_price", 2], ["p_rp", 4], ["mvrv_z", 4], ["puell", 4],
    ["hash_state"], ["hash_buy_date"],
    ["fng_w", 1], ["fng_4w", 1], ["fng_fear_weeks"], ["funding_30d", 5], ["wiki_4w", 0],
    ["halving_last"], ["days_since_halving"],
  ];
  const cell = (r, [k, d]) => (d == null ? r[k] ?? null : round(r[k], d));
  await writeJSON("data/weekly.json", {
    schema: 1, stage: "M1", generated_at: new Date(NOW).toISOString(),
    columns: COLS.map(([k]) => k),
    rows: rows.map((r) => COLS.map((c) => cell(r, c))),
  });

  // ---------------------------------------------------------- Motoren und Phasen (M2)
  const cfg = await readJSON("config/engine.json");
  const sthByWeek = weekId && sthValue != null ? { [weekId]: sthValue } : {};
  const engineRows = toRows({ columns: COLS.map(([k]) => k), rows: rows.map((r) => COLS.map((c) => cell(r, c))) }, { sthByWeek });
  const run = replay(engineRows, cfg);
  const cur = run.weeks.at(-1);
  if (!cur || cur.w !== weekId) throw new Error("Phasenmaschine lieferte keine aktuelle Woche.");

  const oldEvents = await readJSON("data/events.json", { events: [] });
  const notified = new Map((oldEvents.events || []).map((e) => [e.id, e.notified_at ?? null]));
  await writeJSON("data/events.json", {
    schema: 1, generated_at: new Date(NOW).toISOString(), config_version: cfg.version,
    events: run.events.map((e) => ({ ...e, notified_at: notified.get(e.id) ?? null })),
  }, { pretty: true });
  await writeJSON("data/state.json", { schema: 1, config_version: cfg.version, ...run.state }, { pretty: true });
  await writeJSON("data/phases.json", {
    schema: 1, generated_at: new Date(NOW).toISOString(),
    columns: ["w", "close", "phase", "buy", "sell", "cycle_no"],
    rows: run.weeks.map((x) => [x.w, x.close, x.phase, x.buy, x.sell, x.cycle_no]),
  });

  // ---------------------------------------------------------- latest.json
  const ageOf = (asOf) => (asOf ? daysBetween(asOf, weekId) : null);
  const ind = (value, unit, asOf, source, freshKey, note = null, extra = {}) => {
    const age = ageOf(asOf);
    const missing = value == null;
    return {
      value: missing ? null : value, unit, as_of: asOf ?? null, age_days: age, source,
      stale: !missing && age != null && age > FRESH[freshKey],
      missing, note, ...extra,
    };
  };
  const r4 = (v) => round(v, 4), r2 = (v) => round(v, 2);
  const CM = "Coin Metrics (berechnet)";

  const sthAge = sthValue != null && sthManual.as_of ? daysBetween(sthManual.as_of, weekId) : null;

  const indicators = {
    mvrv_z: ind(r4(row.mvrv_z), "σ", row.onchain_as_of, CM, "onchain"),
    realized_price: ind(r2(row.realized_price), "USD", row.onchain_as_of, CM, "onchain", "Preis ÷ MVRV-Verhältnis"),
    p_rp: ind(r4(row.p_rp), "×", row.onchain_as_of, CM, "onchain"),
    p_200w: ind(r4(row.p_200w), "×", weekId, "Bitstamp", "price", null, { sma200w: r2(row.sma200w) }),
    mayer: ind(r4(row.mayer), "×", weekId, "Bitstamp", "price", null, { sma200d: r2(row.sma200d) }),
    puell: ind(r4(row.puell), "×", row.onchain_as_of, CM, "onchain"),
    hash_ribbons: ind(row.hash_state, "Zustand", row.onchain_as_of, CM, "onchain", null, { last_buy_signal: row.hash_buy_date }),
    drawdown: ind(r2(row.drawdown), "%", weekId, "Bitstamp", "price"),
    months_since_ath: ind(r2(row.months_since_ath), "Monate", weekId, "Bitstamp", "price"),
    days_since_halving: ind(row.days_since_halving, "Tage", weekId, "Halving-Tabelle", "price", "Tage seit dem letzten Halving, unabhängig vom Zyklus"),
    bmsb_ext: ind(r4(row.bmsb_ext), "×", weekId, "Bitstamp", "price"),
    pi_cycle: ind(r4(row.pi_cycle), "×", weekId, "Bitstamp", "price"),
    fng_fear_weeks: ind(row.fng_fear_weeks, "Wochen", weekId, "alternative.me", "fng", "Wochen mit Ø < 25 in den letzten 8"),
    fng_4w: ind(round(row.fng_4w, 1), "0–100", weekId, "alternative.me", "fng"),
    funding_30d: ind(round(row.funding_30d, 5), "% / 8 h", weekId, "Deribit", "funding"),
    retail_attention: ind(round(row.wiki_4w, 0), "Aufrufe/Tag", weekId, "Wikimedia", "wiki", "Perzentil folgt in M2"),
    ...Object.fromEntries(Object.entries(PENDING).map(([k, name]) => [k,
      ind(null, null, null, "BGeometrics", "onchain", `${name}: Quelle ausstehend (Nutzungsbedingungen, SPEC 3.4)`)])),
  };

  // Die Zyklus-Uhr kennt erst die Phasenmaschine (relevantes Halving, SPEC 6.2).
  indicators.cycle_clock = ind(cur.cycle_days ?? 0, "Tage", weekId, "Halving-Tabelle", "price",
    cur.cycle_days == null ? "Das relevante Halving steht noch aus, die Uhr zählt 0." : null,
    { relevant_halving: run.state.relevant_halving });

  const filters = {
    bmsb: { lower: r2(row.bmsb_lo), upper: r2(row.bmsb_hi), as_of: weekId },
    sth_rp: {
      value: sthValue, as_of: sthValue != null ? sthManual.as_of : null, age_days: sthAge,
      stale: sthValue != null && sthAge != null && sthAge > FRESH.manual,
      source: sthValue != null ? `manuell${sthManual.note ? " (" + sthManual.note + ")" : ""}` : null,
      missing: sthValue == null,
      note: sthValue == null ? "In data/manual.json eintragen" : null,
    },
  };

  // Halving-Schätzung aus Blockhöhe und aktuellem Blocktempo
  let nextHalving = null;
  if (net?.height) {
    const left = NEXT_HALVING_HEIGHT - net.height;
    const perBlock = net.time_avg_ms && net.time_avg_ms > 60_000 ? net.time_avg_ms : 600_000;
    nextHalving = { height: NEXT_HALVING_HEIGHT, blocks_left: left, estimate: iso(Date.parse(net.updated_at) + left * perBlock), tip_height: net.height, as_of: net.updated_at.slice(0, 10) };
  }

  // ---------------------------------------------------------- Handlungssatz (SPEC 7.3)
  const openTranche = ["B1", "B2", "B3", "S1", "S2", "S3"].find((t) => run.state.tranches[t] === weekId);
  const buyZone = zoneName(cur.buy, cfg.engines.buy.zone_min_score);
  const sellZone = zoneName(cur.sell, cfg.engines.sell.zone_min_score);
  const action = buildAction(cur, run.state, openTranche, buyZone, sellZone, cfg);
  const lamp = cur.flags.data_gap || cur.flags.unclear ? "gelb"
    : openTranche?.startsWith("B") ? "gruen"
    : openTranche?.startsWith("S") ? "rot"
    : cur.phase === 3 ? "rot"
    : cur.phase === 1 ? "gruen"
    : (cur.active === "buy" ? buyZone : sellZone) === "annaeherung" || cur.counter > 0 ? "gelb" : "aus";

  const lastIdx = close.length - 1;
  const latest = {
    schema: 1,
    stage: "M2",
    config_version: cfg.version,
    mode: MODE,
    generated_at: new Date(NOW).toISOString(),
    week_id: weekId,
    price: { close: r2(row.close), date: weekId, source: "Bitstamp", provenance },
    today: { date: dates[lastIdx], close: r2(close[lastIdx]), fng: input.fng[lastIdx], note: "Tageswert, vorläufig, löst nichts aus" },
    cycle_clock: {
      ath: r2(row.ath), ath_date: row.ath_date, days_since_ath: row.ath_date ? daysBetween(row.ath_date, weekId) : null,
      halvings: HALVINGS, last_halving: row.halving_last, days_since_last_halving: row.days_since_halving,
      next_halving: nextHalving,
    },
    phase: { id: cur.phase, name: PHASE_NAMES[cur.phase], since: run.state.phase_since,
             weeks: Math.round((Date.parse(weekId) - Date.parse(run.state.phase_since)) / (7 * DAY)),
             cycle_no: run.state.cycle_no },
    lamp,
    action,
    engines: {
      buy: engineOut(cur.engines.buy, cfg.engines.buy, cur.gates, "buy", buyZone),
      sell: engineOut(cur.engines.sell, cfg.engines.sell, cur.gates, "sell", sellZone),
      active: cur.active,
    },
    next_transition: {
      to: cur.phase === 4 ? 1 : cur.phase + 1,
      counter: cur.counter, needed: cfg.confirm_weeks, conditions: cur.conditions,
    },
    flags: cur.flags,
    tranches: run.state.tranches,
    scores: cur.scores,
    indicators,
    filters,
    missing: Object.entries(indicators).filter(([, v]) => v.missing).map(([k]) => k),
    stale: Object.entries(indicators).filter(([, v]) => v.stale).map(([k]) => k),
    sources: Object.fromEntries(Object.entries(status).filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => [k, { ok: v.ok, last: v.last ?? null, error: v.error ?? null, at: v.at }])),
    attribution: [
      "On-Chain-Daten: Coin Metrics Community Data, CC BY-NC 4.0 (coinmetrics.io)",
      "Fear & Greed Index: alternative.me",
      "Seitenaufrufe: Wikimedia Foundation",
      "Preise: Bitstamp, Coinbase · Funding: Deribit · Blockhöhe: mempool.space",
    ],
  };
  await writeJSON("data/latest.json", latest, { pretty: true });

  // ---------------------------------------------------------- Zusammenfassung
  console.log(`Wochenschluss ${weekId}: ${fmt(row.close)} USD · ${rows.length} Wochen · Preisherkunft ${JSON.stringify(provenance)}`);
  for (const [k, v] of Object.entries(indicators)) {
    const flag = v.missing ? "–" : v.stale ? "⚠" : "✓";
    console.log(`  ${flag} ${k.padEnd(18)} ${v.missing ? v.note : `${v.value} ${v.unit ?? ""}`}${v.stale ? ` (alt: ${v.as_of})` : ""}`);
  }
  console.log(`  ${filters.sth_rp.missing ? "–" : "✓"} sth_rp             ${filters.sth_rp.missing ? filters.sth_rp.note : filters.sth_rp.value}`);
  console.log(`\nPhase ${cur.phase} ${PHASE_NAMES[cur.phase]} seit ${run.state.phase_since} · Ampel ${lamp}`);
  console.log(`Kauf-Motor ${cur.buy ?? "–"} (${buyZone}, Abdeckung ${Math.round(cur.engines.buy.coverage * 100)} %, ${cur.engines.buy.confluence.in_zone} in Zone / ${cur.engines.buy.confluence.families} Familien)`);
  console.log(`Verkauf-Motor ${cur.sell ?? "–"} (${sellZone}, Abdeckung ${Math.round(cur.engines.sell.coverage * 100)} %)`);
  console.log(`Gates: A=${cur.gates.A} B=${cur.gates.B} E1=${cur.gates.E1} E2=${cur.gates.E2} · Zähler ${cur.counter}/${cfg.confirm_weeks}`);
  console.log(`→ ${action.text}`);
}

const fmt = (v) => (v == null ? "–" : Math.round(v).toLocaleString("de-CH"));

function engineOut(eng, cfgEng, gates, side, zone) {
  const c = confluenceOk(eng, cfgEng.confluence);
  return {
    score: eng.score, zone, coverage: Math.round(eng.coverage * 100) / 100,
    families: eng.families,
    confluence: { ...eng.confluence, need_indicators: c.need_indicators, need_families: c.need_families, ok: c.ok, reduced: c.reduced },
    gates: side === "buy" ? { A: gates.A, B: gates.B } : { E1: gates.E1, E2: gates.E2 },
  };
}

const TR_TEXT = { B1: "Kauftranche 1 von 3", B2: "Kauftranche 2 von 3", B3: "Kauftranche 3 von 3",
                  S1: "Verkaufstranche 1 von 3", S2: "Verkaufstranche 2 von 3", S3: "Verkaufstranche 3 von 3" };

function buildAction(cur, state, tranche, buyZone, sellZone, cfg) {
  if (cur.flags.data_gap) return { code: "DATA_GAP", tranche: null, text: "Daten unvollständig. Diese Woche keine Entscheidung." };
  if (cur.flags.unclear) return { code: "UNCLEAR", tranche: null, text: "Signale widersprechen sich. Nichts tun." };
  if (tranche) return { code: tranche + "_DUE", tranche, text: `${TR_TEXT[tranche]} fällig.` };
  if (cur.phase === 1) {
    const open = ["B1", "B2", "B3"].filter((t) => !state.tranches[t]);
    if (!open.length) return { code: "WAIT_CONFIRM", tranche: null, text: "Alle Kauftranchen ausgelöst. Warten auf die Bestätigung des Tiefs." };
    if (open.length === 1 && open[0] === "B3") return { code: "WAIT_B3", tranche: null, text: "Tranche 3 folgt, sobald das Tief bestätigt ist. Bis dahin nichts tun." };
    return { code: "IN_ACCUMULATION", tranche: null, text: `Akkumulationsphase. Nächste Tranche: ${open[0]}.` };
  }
  if (cur.phase === 3) {
    const open = ["S1", "S2", "S3"].filter((t) => !state.tranches[t]);
    return { code: "IN_DISTRIBUTION", tranche: null,
      text: open.length ? "Top-Zone. Noch nichts verkaufen. Verkauft wird bei Überhitzung oder beim Trendbruch."
                        : "Alle Verkaufstranchen ausgelöst. Kernposition halten." };
  }
  if (cur.phase === 2) {
    if (cur.flags.reserve_chance || cur.flags.alert === "buy_in_uptrend")
      return { code: "RESERVE", tranche: null, text: "Halten. Optional: Nachkauf mit der Reserve." };
    if (sellZone === "annaeherung" || cur.counter > 0) return { code: "PREPARE_SELL", tranche: null, text: "Halten. Die Top-Zone rückt näher, Verkaufsplan prüfen." };
    return { code: "HOLD", tranche: null, text: "Halten. Keine Aktion nötig." };
  }
  if (cur.counter > 0) return { code: "PREPARE_BUY", tranche: null, text: "Kaufzone erreicht. Wird sie nächste Woche bestätigt, ist Tranche 1 fällig." };
  if (buyZone === "annaeherung") return { code: "PREPARE_BUY", tranche: null, text: "Bereit machen. Die Kaufzone rückt näher, noch nicht kaufen." };
  return { code: "WAIT", tranche: null, text: "Nichts tun. Die Kaufzone ist noch weit weg." };
}

main().catch((e) => { console.error("Abbruch:", e.message); process.exit(1); });
