import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anchorScore, percentile, score } from "../engine/normalize.mjs";
import { scoreIndicators, engineScore, confluenceOk, gates } from "../engine/engines.mjs";
import { replay } from "../engine/phases.mjs";
import { toRows } from "../engine/rows.mjs";
import { addDays } from "../engine/dates.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config/engine.json", import.meta.url)));

// ---------------------------------------------------------------- Normierung

test("anchorScore interpoliert linear und begrenzt an den Rändern", () => {
  const a = [[2.0, 0], [1.0, 40], [0.0, 90], [-0.5, 100]];
  assert.equal(anchorScore(a, 1.0), 40);
  assert.equal(anchorScore(a, 0.5), 65); // Mitte zwischen 40 und 90
  assert.equal(anchorScore(a, 5), 0); // über dem obersten Anker
  assert.equal(anchorScore(a, -9), 100); // unter dem untersten
  assert.equal(anchorScore(a, null), null);
});

test("anchorScore beherrscht Kurven mit Hochpunkt (Zyklus-Uhr)", () => {
  const a = cfg.anchors.sell.cycle_clock.abs;
  assert.equal(anchorScore(a, 0), 0);
  assert.equal(anchorScore(a, 540), 100); // Plateau zwischen 520 und 560
  assert.equal(anchorScore(a, 900), 0); // weit danach wieder 0
  assert.ok(anchorScore(a, 480) === 70);
});

test("percentile zählt Werte kleiner oder gleich", () => {
  assert.equal(percentile([1, 2, 3, 4], 4), 100);
  assert.equal(percentile([1, 2, 3, 4], 2), 50);
  assert.equal(percentile([], 3), null);
});

test("Hybrid nimmt den höheren der beiden Wege", () => {
  const set = { abs: [[2, 0], [0, 100]], pct: [[100, 0], [0, 100]] };
  assert.equal(score(set, 2, 0), 100); // absolut 0, relativ 100
  assert.equal(score(set, 0, 100), 100); // umgekehrt
  assert.equal(score({ abs: [[0, 10], [1, 20]] }, 0.5, null), 15); // nur absolut
});

// ---------------------------------------------------------------- Zeilenbau für Tests

const BASE = {
  close: 50000, ath: 100000, ath_date: "2025-01-05", drawdown: -50, months_since_ath: 8,
  sma200w: 50000, p_200w: 1.0, sma200d: 50000, mayer: 1.0,
  bmsb_lo: 48000, bmsb_hi: 52000, bmsb_ext: 0.96, pi_cycle: 0.5,
  onchain_as_of: null, mvrv: 1.2, realized_price: 42000, p_rp: 1.2, mvrv_z: 1.0, puell: 1.0,
  hash_state: "normal", hash_buy_date: null,
  fng_w: 50, fng_4w: 50, fng_fear_weeks: 0, funding_30d: 0.01, wiki_4w: 3000,
  halving_last: null, days_since_halving: null,
  supply_loss: null, reserve_risk: null, rhodl: null, lth_dist: null,
  sth_rp: null, dd_52w: -10, _stale: [],
};
const row = (w, o = {}) => ({ ...BASE, w, ...o });

// Tiefe Bärenmarktwerte: löst Gate A und einen hohen Kauf-Score aus
const BEAR = { mvrv_z: -0.2, p_rp: 0.95, p_200w: 0.95, mayer: 0.7, puell: 0.45, hash_state: "kapitulation",
               drawdown: -70, months_since_ath: 12, fng_w: 15, fng_4w: 18, fng_fear_weeks: 6, close: 20000,
               bmsb_lo: 26000, bmsb_hi: 28000 };
// Überhitzung: hoher Verkauf-Score
const TOP = { mvrv_z: 3.2, p_rp: 2.4, p_200w: 2.2, mayer: 2.5, bmsb_ext: 1.55, pi_cycle: 0.99,
              fng_4w: 85, funding_30d: 0.05, wiki_4w: 20000, close: 120000, bmsb_lo: 90000, bmsb_hi: 95000,
              drawdown: 0, months_since_ath: 0 };

// ---------------------------------------------------------------- Motoren

test("Eine Familie zählt erst ab 50 Prozent Innengewicht", () => {
  const r = row("2026-01-04", BEAR);
  const s = scoreIndicators(r, [], cfg);
  const buy = engineScore(s, cfg.engines.buy, "buy");
  assert.equal(buy.families.halter_stimmung.available, false, "nur 1 von 3 Mitgliedern vorhanden");
  assert.equal(buy.families.bewertung.available, true);
  assert.equal(Math.round(buy.coverage * 100), 80, "20 Prozent Gewicht fällt weg");
  assert.ok(buy.score >= 60, `Kauf-Score zu niedrig: ${buy.score}`);
});

test("Ein als alt markierter Wert zählt nicht in den Score", () => {
  const r = row("2026-01-04", { ...BEAR, _stale: ["mvrv_z", "p_rp", "p_200w", "mayer"] });
  const buy = engineScore(scoreIndicators(r, [], cfg), cfg.engines.buy, "buy");
  assert.equal(buy.families.bewertung.available, false);
  assert.ok(buy.coverage < cfg.zone_min_coverage, "unter der Mindestabdeckung");
});

test("Ohne Stimmungsdaten bleibt der Verkaufs-Motor entscheidungsfähig", () => {
  // Lage vor Februar 2018: kein Fear & Greed, kein Funding, dazu die fehlenden BGeometrics-Daten
  const r = row("2017-12-17", { ...TOP, fng_4w: null, funding_30d: null, wiki_4w: null });
  const sell = engineScore(scoreIndicators(r, [], cfg), cfg.engines.sell, "sell");
  assert.equal(sell.families.euphorie.available, false);
  assert.equal(sell.families.halter.available, false);
  assert.equal(Math.round(sell.coverage * 100), 65);
  assert.ok(sell.coverage >= cfg.zone_min_coverage, "65 Prozent müssen für eine Entscheidung genügen");
  assert.ok(sell.score >= cfg.gates.sell_E2.score_min, `Verkauf-Score zu niedrig: ${sell.score}`);
});

test("Die Zyklus-Uhr steht auf 0, wenn das relevante Halving noch aussteht", () => {
  const r = row("2026-01-04");
  const s = scoreIndicators(r, [], cfg);
  assert.equal(s.cycle_clock.score_sell, 0);
  const sell = engineScore(s, cfg.engines.sell, "sell");
  assert.equal(sell.families.zeit_trend.available, true, "Familie darf nicht ausfallen");
});

test("Konvergenz senkt die Familienanforderung, wenn Familien fehlen", () => {
  const r = row("2026-01-04", BEAR);
  const buy = engineScore(scoreIndicators(r, [], cfg), cfg.engines.buy, "buy");
  const c = confluenceOk(buy, cfg.engines.buy.confluence);
  assert.equal(c.need_families, 3, "drei Familien verfügbar, also auch drei gefordert");
  assert.equal(c.ok, true);

  // Nur zwei Familien verfügbar: Anforderung sinkt auf zwei
  const r2 = row("2026-01-04", { ...BEAR, puell: null, hash_state: null });
  const buy2 = engineScore(scoreIndicators(r2, [], cfg), cfg.engines.buy, "buy");
  const c2 = confluenceOk(buy2, cfg.engines.buy.confluence);
  assert.equal(c2.need_families, 2);
  assert.equal(c2.reduced, true);
});

test("Gate A greift über MVRV-Z oder über den Realized Price", () => {
  const mk = (o) => {
    const r = row("2026-01-04", { ...BEAR, ...o });
    const s = scoreIndicators(r, [], cfg);
    return gates(r, s, cfg, engineScore(s, cfg.engines.buy, "buy"), engineScore(s, cfg.engines.sell, "sell"), null);
  };
  assert.equal(mk({}).A, true);
  assert.equal(mk({ mvrv_z: 0.5, p_rp: 0.98 }).A, true, "unter Realized Price genügt");
  assert.equal(mk({ mvrv_z: 0.5, p_rp: 1.3 }).A, false);
});

test("Gate B erkennt ein flaches Tief ohne Angebot-im-Verlust", () => {
  const flat = { mvrv_z: 0.4, p_rp: 1.12, p_200w: 1.0, mayer: 0.95, drawdown: -52, months_since_ath: 8 };
  const hist = Array.from({ length: 150 }, (_, i) => row(addDays("2023-01-01", i * 7), { mvrv_z: 2 + i / 100 }));
  const r = row("2026-01-04", flat);
  const s = scoreIndicators(r, hist, cfg);
  assert.ok(s.mvrv_z.pct <= 15, `MVRV-Perzentil zu hoch: ${s.mvrv_z.pct}`);
  const g = gates(r, s, cfg, engineScore(s, cfg.engines.buy, "buy"), engineScore(s, cfg.engines.sell, "sell"), null);
  assert.equal(g.A, false, "klassisches Gate greift hier nicht");
  assert.equal(g.B, true, "flaches Tief wird erkannt");
});

// ---------------------------------------------------------------- Phasenmaschine

// Baut eine Wochenfolge: [[anzahl, überschreibungen], ...] ab startWeek
function scenario(startWeek, blocks) {
  const rows = [];
  let w = startWeek;
  for (const [n, o] of blocks) {
    for (let i = 0; i < n; i++) { rows.push(row(w, typeof o === "function" ? o(i) : o)); w = addDays(w, 7); }
  }
  return rows;
}

test("Phasenwechsel braucht zwei Wochenschlüsse in Folge", () => {
  const rows = scenario("2019-01-06", [[1, BEAR], [1, {}], [2, BEAR], [2, {}]]);
  const r = replay(rows, { ...cfg, bootstrap: { start_week: "2019-01-06", start_phase: 4 } });
  const ph = r.weeks.map((x) => x.phase);
  assert.deepEqual(ph, [4, 4, 4, 1, 1, 1], "erst die zweite Bestätigung wechselt");
  assert.equal(r.weeks[1].counter, 0, "Zähler fällt nach einer verfehlten Woche zurück");
});

test("Voller Zyklus: Akkumulation, Aufwärtstrend, Verteilung, Abwärtstrend", () => {
  const mid = { close: 60000, bmsb_lo: 50000, bmsb_hi: 55000, mvrv_z: 1.5, p_rp: 1.4, p_200w: 1.3,
                mayer: 1.2, drawdown: -20, months_since_ath: 20, puell: 1.2, hash_state: "normal" };
  const rows = scenario("2018-11-04", [
    [4, BEAR],                                   // Kaufzone → Phase 1
    [10, { ...BEAR, close: 22000 }],             // Akkumulation, B2 per Zeitstaffelung
    [4, mid],                                    // Tief bestätigt → Phase 2
    [130, mid],                                  // Aufwärtstrend bis ins Zeitfenster
    [10, TOP],                                   // Top-Zone → Phase 3, Verkaufstranchen
    [6, { ...TOP, close: 70000, bmsb_lo: 90000, bmsb_hi: 95000 }], // Trendbruch → Phase 4
  ]);
  const r = replay(rows, { ...cfg, bootstrap: { start_week: "2018-11-04", start_phase: 4 } });
  // Aufeinanderfolgende Wiederholungen zusammenfassen (Set würde die zweite 4 schlucken)
  const seen = r.weeks.map((x) => x.phase).filter((p, i, a) => i === 0 || p !== a[i - 1]);
  assert.deepEqual(seen, [4, 1, 2, 3, 4], "alle vier Phasen in der richtigen Reihenfolge");

  const types = r.events.filter((e) => e.type === "TRANCHE_DUE").map((e) => e.tranche);
  assert.ok(types.includes("B1") && types.includes("B2") && types.includes("B3"), `Kauftranchen fehlen: ${types}`);
  assert.ok(r.events.some((e) => e.type === "TREND_BREAK"), "Trendbruch fehlt");
  assert.equal(r.state.phase, 4);
  assert.ok(["S1", "S2", "S3"].every((t) => r.state.tranches[t]), "alle Verkaufstranchen ausgelöst");
});

test("B2 kommt frühestens nach 4 und spätestens nach 12 Wochen", () => {
  // Nach B1 nur schwache Wochen: die Zeitstaffelung muss greifen
  const weak = { ...BEAR, mvrv_z: 0.9, p_rp: 1.3, p_200w: 1.2, mayer: 1.05, puell: 0.9, hash_state: "normal" };
  const rows = scenario("2019-01-06", [[2, BEAR], [20, weak]]);
  const r = replay(rows, { ...cfg, bootstrap: { start_week: "2019-01-06", start_phase: 4 } });
  const b1 = r.events.find((e) => e.tranche === "B1"), b2 = r.events.find((e) => e.tranche === "B2");
  assert.ok(b1 && b2, "beide Tranchen müssen ausgelöst haben");
  const wks = Math.round((Date.parse(b2.week_id) - Date.parse(b1.week_id)) / (7 * 86400000));
  assert.equal(wks, cfg.tranches.b2_max_weeks, "genau nach der Höchstfrist");
  assert.ok(b2.text.includes("Zeitstaffelung"));
});

test("Datenlücke hält die Zähler an, statt sie zurückzusetzen", () => {
  const blind = { mvrv_z: null, p_rp: null, p_200w: null, mayer: null, puell: null, hash_state: null,
                  drawdown: null, months_since_ath: null, fng_fear_weeks: null };
  const rows = scenario("2019-01-06", [[1, BEAR], [2, blind], [1, BEAR]]);
  const r = replay(rows, { ...cfg, bootstrap: { start_week: "2019-01-06", start_phase: 4 } });
  assert.equal(r.weeks[1].flags.data_gap, true);
  assert.equal(r.weeks[1].counter, 1, "Zähler bleibt während der Lücke stehen");
  assert.equal(r.weeks[3].phase, 1, "die nächste gute Woche bestätigt den Wechsel");
  assert.ok(r.events.some((e) => e.type === "DATA_GAP"));
});

test("Phasen laufen nur vorwärts: ein neues Hoch in Phase 4 ändert nichts", () => {
  const rows = scenario("2019-01-06", [[3, BEAR], [6, { ...TOP, close: 200000 }]]);
  const r = replay(rows, { ...cfg, bootstrap: { start_week: "2019-01-06", start_phase: 4 } });
  const phases = r.weeks.map((x) => x.phase);
  for (let i = 1; i < phases.length; i++) {
    const ok = phases[i] === phases[i - 1] || phases[i] === (phases[i - 1] % 4) + 1;
    assert.ok(ok, `unerlaubter Sprung ${phases[i - 1]} → ${phases[i]}`);
  }
});

test("Kein Blick in die Zukunft: abgeschnittene Historie ergibt dieselbe Woche", () => {
  const rows = scenario("2019-01-06", [[60, (i) => ({ mvrv_z: 2 - i * 0.05, p_rp: 1.6 - i * 0.02, close: 50000 - i * 500 })]]);
  const opts = { ...cfg, bootstrap: { start_week: "2019-01-06", start_phase: 4 } };
  const full = replay(rows, opts);
  const cut = replay(rows.slice(0, 40), opts);
  const w = cut.weeks.at(-1).w;
  const same = full.weeks.find((x) => x.w === w);
  assert.equal(same.buy, cut.weeks.at(-1).buy);
  assert.equal(same.phase, cut.weeks.at(-1).phase);
  assert.deepEqual(same.scores.mvrv_z, cut.weeks.at(-1).scores.mvrv_z);
});

test("toRows ergänzt den 52-Wochen-Rückgang und kennzeichnet fehlende Quellen", () => {
  const weekly = {
    columns: ["w", "close", "mvrv_z"],
    rows: [["2025-01-05", 100000, 2], ["2025-01-12", 90000, 1.8], ["2025-01-19", 50000, 1]],
  };
  const rs = toRows(weekly);
  assert.equal(rs[2].dd_52w, -50);
  assert.equal(rs[0].supply_loss, null);
  assert.deepEqual(rs[0]._stale, []);

  const withManual = toRows(weekly, { manual: { supply_loss: { "2025-01-19": 48 }, sth_rp: { "2025-01-19": 60000 } } });
  assert.equal(withManual[2].supply_loss, 48);
  assert.equal(withManual[2].sth_rp, 60000);
  assert.equal(withManual[0].supply_loss, null, "nur die Woche mit Lesung");
});

test("Nur wertende Familien zählen zur Konvergenz", () => {
  // "Halter & Stimmung" hat nur Fear & Greed: die Familie geht nicht in den Score ein
  // und darf deshalb auch keinen Indikator zur Konvergenz beisteuern.
  const r = row("2018-12-16", { ...BEAR, fng_fear_weeks: 8 });
  const buy = engineScore(scoreIndicators(r, [], cfg), cfg.engines.buy, "buy");
  assert.equal(buy.families.halter_stimmung.available, false);
  assert.ok(!buy.confluence.ids.includes("fng_fear_weeks"), "darf nicht mitzählen");
  assert.ok(buy.confluence.families <= buy.confluence.available_families,
    `mehr Zonen-Familien (${buy.confluence.families}) als verfügbare (${buy.confluence.available_families})`);
});

test("Weg E2 koppelt seine Schwelle an die Abdeckung", () => {
  // Stilles Hoch: Zeitfenster erfüllt, aber keine Euphorie und keine Halter-Daten
  const quiet = { ...TOP, mvrv_z: 1.9, mayer: 1.2, pi_cycle: 0.6, bmsb_ext: 1.12,
                  fng_4w: 52, funding_30d: 0.008, wiki_4w: 3000 };
  const r = row("2025-10-05", quiet);
  const s = scoreIndicators(r, [], cfg);
  r.cycle_days = 533;
  const s2 = scoreIndicators(r, [], cfg);
  const sell = engineScore(s2, cfg.engines.sell, "sell");
  const g = gates(r, s2, cfg, engineScore(s2, cfg.engines.buy, "buy"), sell, 533);
  assert.equal(Math.round(sell.coverage * 100), 80, "Familie Halterverhalten fehlt");
  assert.equal(g.e2_min, 32, "40 × 0,80");
  assert.ok(sell.score >= g.e2_min, `Score ${sell.score} muss die gekoppelte Schwelle erreichen`);
  assert.equal(g.E2, true);

  // Ohne Kopplung wäre dieselbe Lage knapp gescheitert
  const fixed = { ...cfg, gates: { ...cfg.gates, sell_E2: { ...cfg.gates.sell_E2, scale_by_coverage: false } } };
  const gFixed = gates(r, s2, fixed, engineScore(s2, fixed.engines.buy, "buy"), sell, 533);
  assert.equal(gFixed.e2_min, 40);
});

test("Ein einzelner manueller Wert ergibt kein Perzentil und damit keinen Score", () => {
  // Manuelle Kennzahlen bauen erst über Monate Historie auf. Ohne Untergrenze
  // wäre ein einzelner Wert automatisch das 100. Perzentil.
  const r = row("2026-09-06", { rhodl: 2100 });
  const s = scoreIndicators(r, [], cfg);
  assert.equal(s.rhodl.value, 2100, "der Rohwert wird angezeigt");
  assert.equal(s.rhodl.pct, null);
  assert.equal(s.rhodl.pct_basis, "zu_kurz");
  assert.equal(s.rhodl.score_sell, null, "zählt nicht in den Score");

  // Mit genügend Historie greift das Perzentil
  const hist = Array.from({ length: 40 }, (_, i) => row(addDays("2025-12-07", i * 7), { rhodl: 1000 + i }));
  const s2 = scoreIndicators(r, hist, cfg);
  assert.equal(s2.rhodl.pct, 100);
  assert.ok(s2.rhodl.score_sell > 0);
});

test("Ein manuelles Angebot im Verlust macht die Familie Halter und Stimmung verfügbar", () => {
  const withOut = engineScore(scoreIndicators(row("2026-09-06", BEAR), [], cfg), cfg.engines.buy, "buy");
  assert.equal(withOut.families.halter_stimmung.available, false);
  assert.equal(Math.round(withOut.coverage * 100), 80);

  const withIt = engineScore(scoreIndicators(row("2026-09-06", { ...BEAR, supply_loss: 52 }), [], cfg), cfg.engines.buy, "buy");
  assert.equal(withIt.families.halter_stimmung.available, true, "2 von 3 Mitgliedern genügen");
  assert.equal(Math.round(withIt.coverage * 100), 100);
});

// ---------------------------------------------------------------- Benachrichtigungen

test("Alte Ereignisse werden stumm abgehakt, nicht verschickt", async () => {
  const { selectPending } = await import("../scripts/lib/events.mjs");
  const now = Date.parse("2026-09-12T00:00:00Z");
  const events = [
    { id: "a", week_id: "2018-12-02", type: "TRANCHE_DUE", notified_at: null },
    { id: "b", week_id: "2026-09-06", type: "TRANCHE_DUE", notified_at: null },
    { id: "c", week_id: "2026-09-06", type: "ALERT", notified_at: "2026-09-07T00:00:00Z" },
  ];
  const r = selectPending(events, { now });
  assert.deepEqual(r.send.map((e) => e.id), ["b"], "nur das frische Ereignis");
  assert.deepEqual(r.backfill.map((e) => e.id), ["a"], "das alte wird stumm abgehakt");
});

test("Pro Lauf höchstens die Obergrenze, älteste zuerst", async () => {
  const { selectPending } = await import("../scripts/lib/events.mjs");
  const now = Date.parse("2026-09-12T00:00:00Z");
  const events = ["2026-09-06", "2026-09-06", "2026-08-30", "2026-08-30", "2026-08-23", "2026-08-23"]
    .map((w, i) => ({ id: "e" + i, week_id: w, type: "COUNTER", notified_at: null }));
  const r = selectPending(events, { now, cap: 2 });
  assert.equal(r.send.length, 2);
  assert.equal(r.send[0].week_id, "2026-08-23", "älteste zuerst");
  assert.equal(r.skipped, 4);
});

test("Die Pipeline gilt nach neun Tagen ohne Auswertung als stehen geblieben", async () => {
  const { stale } = await import("../scripts/lib/events.mjs");
  const now = Date.parse("2026-09-12T00:00:00Z");
  assert.equal(stale("2026-09-06", { now }), false);
  assert.equal(stale("2026-08-30", { now }), true);
  assert.equal(stale(null, { now }), true);
});

test("Der Jahres-Review kommt einmal pro Jahr in der ersten Januarwoche", async () => {
  const { yearlyReview } = await import("../scripts/lib/events.mjs");
  const jan = Date.parse("2027-01-03T00:00:00Z");
  const first = yearlyReview([], { now: jan });
  assert.ok(first && first.id === "2027:YEARLY_REVIEW");
  assert.equal(yearlyReview([first], { now: jan }), null, "nicht zweimal");
  assert.equal(yearlyReview([], { now: Date.parse("2027-03-01T00:00:00Z") }), null, "nur im Januar");
});
