import { test } from "node:test";
import assert from "node:assert/strict";
import { sma, ema, expandingStd, ffill, valueAtOrBefore, percentileRank, ratio } from "../engine/series.mjs";
import { iso, addDays, daysBetween, weekday, calendar, lastCompletedSunday } from "../engine/dates.mjs";
import { computeDaily, computeWeekly, hashRibbons, HALVINGS } from "../engine/indicators.mjs";

const close2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- Datum

test("lastCompletedSunday liefert den letzten abgeschlossenen Sonntag", () => {
  // Sonntag 2026-09-06 ist erst ab Montag 00:00 UTC abgeschlossen
  assert.equal(lastCompletedSunday(Date.parse("2026-09-06T23:00:00Z")), "2026-08-30");
  assert.equal(lastCompletedSunday(Date.parse("2026-09-07T00:30:00Z")), "2026-09-06");
  assert.equal(lastCompletedSunday(Date.parse("2026-09-11T20:00:00Z")), "2026-09-06");
});

test("Datumshelfer rechnen über Monats- und Jahresgrenzen", () => {
  assert.equal(addDays("2024-02-28", 2), "2024-03-01"); // Schaltjahr
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(daysBetween("2025-10-06", "2026-09-06"), 335);
  assert.equal(weekday("2026-09-06"), 0);
  assert.equal(calendar("2026-09-01", "2026-09-04").length, 4);
});

// ---------------------------------------------------------------- Zeitreihen

test("sma braucht ein volles Fenster und toleriert Lücken bis minCount", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(sma([1, null, 3], 2, 1), [null, 1, 3]); // Lücke erlaubt
  assert.deepEqual(sma([1, null, 3], 2, 2), [null, null, null]); // Lücke nicht erlaubt
});

test("sma zählt Werte, die aus dem Fenster fallen, korrekt heraus", () => {
  const out = sma([10, 20, 30, 40, 50], 3);
  assert.deepEqual(out, [null, null, 20, 30, 40]);
});

test("ema startet mit dem SMA und führt bei Lücken den letzten Wert weiter", () => {
  const out = ema([1, 2, 3, 4], 2);
  assert.equal(out[0], null);
  assert.equal(out[1], 1.5);
  assert.equal(close2(out[2]), close2(1.5 + (3 - 1.5) * (2 / 3)));
  const withGap = ema([1, 2, null, 4], 2);
  assert.equal(withGap[2], 1.5); // Lücke: vorheriger EMA bleibt stehen
});

test("expandingStd blickt nie in die Zukunft", () => {
  const full = expandingStd([2, 4, 4, 4, 5, 5, 7, 9], 2);
  const partial = expandingStd([2, 4, 4, 4], 2);
  assert.equal(full[3], partial[3]);
  assert.equal(close2(full.at(-1)), 2);
});

test("ffill füllt nur bis maxGap", () => {
  assert.deepEqual(ffill([1, null, null, null, 5], 2), [1, 1, 1, null, 5]);
  assert.deepEqual(ffill([null, null, 3], 5), [null, null, 3]); // vor dem ersten Wert bleibt leer
});

test("valueAtOrBefore respektiert das Rückblickfenster", () => {
  const a = [1, null, null, null];
  assert.deepEqual(valueAtOrBefore(a, 3, 3), { value: 1, index: 0 });
  assert.deepEqual(valueAtOrBefore(a, 3, 2), { value: null, index: null });
});

test("percentileRank und ratio verhalten sich an den Rändern sauber", () => {
  assert.equal(percentileRank([1, 2, 3, 4], 4), 100);
  assert.equal(percentileRank([1, 2, 3, 4], 1), 25);
  assert.equal(percentileRank([1, 2, null], null), null);
  assert.equal(ratio(1, 0), null);
  assert.equal(ratio(null, 2), null);
});

// ---------------------------------------------------------------- Hash Ribbons

test("hashRibbons meldet Kapitulation und erst nach Preisbestätigung ein Kaufsignal", () => {
  const n = 400;
  const hash = new Array(n).fill(0).map((_, i) => (i < 200 ? 100 + i : i < 260 ? 300 - (i - 200) * 2 : 180 + (i - 260) * 3));
  const price = new Array(n).fill(0).map((_, i) => (i < 300 ? 100 : 100 + (i - 300) * 5));
  const r = hashRibbons(hash, price);
  assert.ok(r.state.slice(230, 260).includes("kapitulation"));
  const firstBuy = r.lastBuy.findIndex((v) => v != null);
  assert.ok(firstBuy > 260, "Kaufsignal erst nach der Erholung");
  assert.equal(r.lastBuy.at(-1), r.lastBuy[firstBuy], "Signal bleibt als letztes bekanntes stehen");
});

// ---------------------------------------------------------------- Indikatoren

// Baut einen synthetischen Datensatz: Preis steigt linear, MVRV konstant 2.
function fixture(days = 1500, startDay = "2022-01-02") {
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(addDays(startDay, i));
  const close = dates.map((_, i) => 10000 + i * 10);
  const d = {
    dates, close,
    cm: {
      price: close.slice(), mc: close.map((c) => c * 19e6), mvrv: close.map(() => 2),
      iss: close.map(() => 1e6), hash: close.map((_, i) => 100 + i),
    },
    fng: close.map(() => 50),
    funding: close.map(() => 0.01),
    wiki: close.map(() => 5000),
  };
  return d;
}

test("Realized Price und MVRV-Z entstehen korrekt aus dem MVRV-Verhältnis", () => {
  const d = fixture();
  const daily = computeDaily(d);
  const w = computeWeekly(d, daily);
  const last = w.at(-1);
  assert.equal(close2(last.realized_price), close2(last.close / 2)); // MVRV = 2
  assert.equal(close2(last.p_rp), 2);
  assert.ok(last.mvrv_z > 0, "steigender Markt über Einstandswert");
});

test("computeWeekly liefert genau die Sonntage in der richtigen Reihenfolge", () => {
  const d = fixture(400);
  const w = computeWeekly(d, computeDaily(d));
  assert.ok(w.every((r) => weekday(r.w) === 0));
  assert.ok(w.every((r, i) => i === 0 || r.w > w[i - 1].w));
  assert.equal(w.length, Math.floor((400 - 1) / 7) + (weekday(d.dates[0]) === 0 ? 1 : 0));
});

test("Drawdown, Allzeithoch und Monate seit Hoch stimmen nach einem Rückgang", () => {
  const d = fixture(900);
  const peak = 600;
  const peakPrice = d.close[peak];
  for (let i = peak + 1; i < d.dates.length; i++) d.close[i] = peakPrice * 0.5;
  const w = computeWeekly(d, computeDaily(d));
  const last = w.at(-1);
  assert.equal(close2(last.ath), close2(peakPrice));
  assert.equal(last.ath_date, d.dates[peak]);
  assert.equal(close2(last.drawdown), -50);
  const months = daysBetween(d.dates[peak], last.w) / 30.44;
  assert.equal(close2(last.months_since_ath), close2(months));
});

test("On-Chain-Werte dürfen bis zu zehn Tage zurückgreifen, danach fehlen sie", () => {
  const d = fixture(600);
  const last = d.dates.length - 1;
  let s = last; while (weekday(d.dates[s]) !== 0) s--;
  const clearFrom = (k) => { for (let i = s - k; i <= last; i++) d.cm.mvrv[i] = null; };

  clearFrom(2); // 2 Tage Lücke
  let row = computeWeekly(d, computeDaily(d)).find((r) => r.w === d.dates[s]);
  assert.equal(row.onchain_as_of, d.dates[s - 3]);

  clearFrom(9); // 9 Tage Lücke, noch im Rückblickfenster
  row = computeWeekly(d, computeDaily(d)).find((r) => r.w === d.dates[s]);
  assert.equal(row.onchain_as_of, d.dates[s - 10]);
  assert.ok(row.mvrv != null);

  clearFrom(12); // zu grosse Lücke
  row = computeWeekly(d, computeDaily(d)).find((r) => r.w === d.dates[s]);
  assert.equal(row.mvrv, null);
  assert.equal(row.onchain_as_of, null);
});

test("fng_fear_weeks zählt nur bei ausreichender Historie", () => {
  const d = fixture(400);
  d.fng = d.fng.map((_, i) => (i > 200 ? 10 : 50)); // später extreme Angst
  const w = computeWeekly(d, computeDaily(d));
  assert.equal(w.at(-1).fng_fear_weeks, 8);
  assert.equal(w[0].fng_fear_weeks, null, "am Anfang zu wenig Wochen");
});

test("Bull Market Support Band ordnet Unter- und Oberkante richtig zu", () => {
  const d = fixture(900);
  const w = computeWeekly(d, computeDaily(d)).filter((r) => r.bmsb_hi != null);
  assert.ok(w.length > 0);
  assert.ok(w.every((r) => r.bmsb_lo <= r.bmsb_hi));
  assert.ok(w.every((r) => r.bmsb_ext === r.close / r.bmsb_hi));
});

test("Zyklus-Uhr ordnet jedem Wochenschluss das letzte Halving zu", () => {
  const d = fixture(1500, "2024-01-07");
  const w = computeWeekly(d, computeDaily(d));
  const before = w.find((r) => r.w < "2024-04-20");
  const after = w.find((r) => r.w > "2024-04-20");
  assert.equal(before.halving_last, HALVINGS[2]);
  assert.equal(after.halving_last, HALVINGS[3]);
  assert.equal(after.days_since_halving, daysBetween("2024-04-20", after.w));
});

test("Puell Multiple ist 1, wenn die Emission konstant ist", () => {
  const d = fixture(800);
  const w = computeWeekly(d, computeDaily(d)).filter((r) => r.puell != null);
  assert.ok(w.length > 0);
  assert.equal(close2(w.at(-1).puell), 1);
});

test("Pi Cycle: Verhältnis bleibt unter 1, solange kein Kreuzen stattfindet", () => {
  const d = fixture(900);
  const w = computeWeekly(d, computeDaily(d)).filter((r) => r.pi_cycle != null);
  assert.ok(w.length > 0);
  assert.ok(w.every((r) => r.pi_cycle > 0 && r.pi_cycle < 1));
});

test("Kein Blick in die Zukunft: abgeschnittene Daten ergeben dieselbe Woche", () => {
  const full = fixture(1200);
  const cut = 900;
  const truncated = {
    dates: full.dates.slice(0, cut), close: full.close.slice(0, cut),
    cm: Object.fromEntries(Object.entries(full.cm).map(([k, v]) => [k, v.slice(0, cut)])),
    fng: full.fng.slice(0, cut), funding: full.funding.slice(0, cut), wiki: full.wiki.slice(0, cut),
  };
  const a = computeWeekly(full, computeDaily(full));
  const b = computeWeekly(truncated, computeDaily(truncated));
  const lastB = b.at(-1);
  const sameA = a.find((r) => r.w === lastB.w);
  assert.deepEqual(sameA, lastB);
});
