// Tests für die Handwerte: Prüfung, Sperre der zurückgestellten Kennzahlen, Zusammenführen.
// Hintergrund: HANDOFF §4a und §13. Die Regeln standen zuerst nur im Text und wurden
// zweimal versehentlich gebrochen. Diese Tests halten sie im Code fest.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseSubmission, mergeReadings, readingsOf, manualByWeek, priceLookup, DEFERRED, KEYS } from "../scripts/lib/manual.mjs";
import { replay } from "../engine/phases.mjs";
import { toRows } from "../engine/rows.mjs";

const block = (o) => "```json\n" + JSON.stringify(o) + "\n```";
const weeklyMini = { columns: ["w", "close"], rows: [["2026-10-25", 80048], ["2026-11-01", 78233], ["2026-11-08", 74742], ["2026-11-15", 65312]] };

test("zurückgestellt sind genau Reserve Risk, RHODL und LTH-Positionsänderung", () => {
  assert.deepEqual([...DEFERRED].sort(), ["lth_net_position_change", "reserve_risk", "rhodl"]);
  for (const k of DEFERRED) assert.ok(KEYS[k], `${k} muss ein bekannter Schlüssel bleiben`);
});

test("readingsOf: zurückgestellte Kennzahlen erreichen die Auswertung nie", () => {
  const manual = {
    supply_in_profit: [{ d: "2026-11-01", v: 62.17 }],
    reserve_risk: [{ d: "2026-11-01", v: 0.00175 }],
    rhodl: [{ d: "2026-11-01", v: 0.1169 }],
    lth_net_position_change: [{ d: "2026-11-01", v: -262832 }],
  };
  assert.deepEqual(readingsOf(manual, "supply_in_profit"), [["2026-11-01", 62.17]]);
  for (const k of DEFERRED) assert.deepEqual(readingsOf(manual, k), []);
});

test("readingsOf: sortiert, kennt beide Formen, zählt Leeres nicht als 0", () => {
  const manual = {
    sth_realized_price: [{ d: "2026-11-01", v: 75817 }, { d: "2026-09-13", v: "71304" }, { d: "2026-10-04", v: null }, { d: "2026-10-11", v: "" }, { d: "2026-10-18", v: "ABLESEN" }],
    supply_in_profit: { value: 65.32, as_of: "2026-09-13" },
  };
  assert.deepEqual(readingsOf(manual, "sth_realized_price"), [["2026-09-13", 71304], ["2026-11-01", 75817]]);
  assert.deepEqual(readingsOf(manual, "supply_in_profit"), [["2026-09-13", 65.32]]);
  assert.deepEqual(readingsOf({}, "supply_in_profit"), []);
  assert.deepEqual(readingsOf(null, "supply_in_profit"), []);
});

test("parseSubmission: zurückgestellte Werte werden verworfen, die gültigen bleiben", () => {
  const r = parseSubmission(block({
    supply_in_profit: [{ d: "2026-11-15", v: 51.41 }],
    reserve_risk: [{ d: "2026-11-15", v: 0.00175 }],
    rhodl: [],
  }), { today: "2026-11-17" });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.values), ["supply_in_profit"]);
  assert.deepEqual(r.ignored, ["Reserve Risk"]);
});

test("parseSubmission: nur zurückgestellte Werte ergeben eine klare Absage", () => {
  const r = parseSubmission(block({ reserve_risk: [{ d: "2026-11-15", v: 0.00175 }] }), { today: "2026-11-17" });
  assert.equal(r.ok, false);
  assert.match(r.error, /zurückgestellt/);
});

test("parseSubmission: der Tippfehler vom 01.11.2026 wird abgewiesen", () => {
  const priceAt = priceLookup(weeklyMini);
  const bad = parseSubmission(block({ sth_realized_price: [{ d: "2026-11-01", v: 758549 }] }), { today: "2026-11-17", priceAt });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /passt nicht zum Kurs/);
  const zuKlein = parseSubmission(block({ sth_realized_price: [{ d: "2026-11-01", v: 7581 }] }), { today: "2026-11-17", priceAt });
  assert.equal(zuKlein.ok, false);
  const good = parseSubmission(block({ sth_realized_price: [{ d: "2026-11-01", v: 75817 }] }), { today: "2026-11-17", priceAt });
  assert.equal(good.ok, true);
});

test("parseSubmission: ohne Kursbezug gilt nur der feste Bereich", () => {
  const r = parseSubmission(block({ sth_realized_price: [{ d: "2026-11-01", v: 758549 }] }), { today: "2026-11-17" });
  assert.equal(r.ok, true);
});

test("parseSubmission: Angebot im Gewinn als Anteil statt Prozent wird abgewiesen", () => {
  const r = parseSubmission(block({ supply_in_profit: [{ d: "2026-11-15", v: 0.62 }] }), { today: "2026-11-17" });
  assert.equal(r.ok, false);
  assert.match(r.error, /Prozentwert/);
});

test("parseSubmission: leere Werte, Zukunftsdaten und fremde Schlüssel fallen durch", () => {
  assert.equal(parseSubmission(block({ supply_in_profit: [{ d: "2026-11-15", v: null }] }), { today: "2026-11-17" }).ok, false);
  assert.equal(parseSubmission(block({ supply_in_profit: [{ d: "2026-12-01", v: 60 }] }), { today: "2026-11-17" }).ok, false);
  assert.equal(parseSubmission(block({ irgendwas: [{ d: "2026-11-15", v: 1 }] }), { today: "2026-11-17" }).ok, false);
  assert.equal(parseSubmission("kein json", { today: "2026-11-17" }).ok, false);
});

test("priceLookup: letzter Wochenschluss am oder vor dem Tag, sonst der erste", () => {
  const p = priceLookup(weeklyMini);
  assert.equal(p("2026-11-01"), 78233);
  assert.equal(p("2026-11-05"), 78233);
  assert.equal(p("2026-11-17"), 65312);
  assert.equal(p("2020-01-01"), 80048);
  assert.equal(priceLookup(null)("2026-11-01"), null);
});

test("mergeReadings: gleiches Datum ersetzt, Historie bleibt, Zurückgestelltes kommt nicht hinein", () => {
  const current = { _hinweis: "x", sth_realized_price: [{ d: "2026-10-04", v: 74154 }, { d: "2026-11-01", v: 758549 }], reserve_risk: [] };
  const { next, added, replaced } = mergeReadings(current, {
    sth_realized_price: [{ d: "2026-11-01", v: 75817 }, { d: "2026-11-15", v: 74711 }],
    reserve_risk: [{ d: "2026-11-15", v: 0.00175 }],
  });
  assert.equal(added, 1);
  assert.equal(replaced, 1);
  assert.deepEqual(next.sth_realized_price.map((r) => r.v), [74154, 75817, 74711]);
  assert.deepEqual(next.reserve_risk, []);
  assert.equal(next._hinweis, "x");
});

// Die Handwerte bestimmen den Phasenverlauf mit. Eine Lesung ohne Zahl würde still
// ignoriert und könnte die Wiedergabe in einen anderen Zustand kippen. Lieber bricht
// der Wochenlauf hier laut ab.
test("data/manual.json im Repo ist gültig, jede Lesung hat Datum und Zahl", async () => {
  const manual = JSON.parse(await readFile(new URL("../data/manual.json", import.meta.url), "utf8"));
  for (const k of ["sth_realized_price", "supply_in_profit"]) {
    const raw = manual[k] ?? [];
    assert.ok(Array.isArray(raw), `${k} muss eine Liste sein`);
    assert.equal(readingsOf(manual, k).length, raw.length, `${k}: jede Lesung braucht Datum und Zahl`);
  }
});

// Der Kern der Sache: Die Wiedergabe darf sich durch zurückgestellte Einträge nicht ändern.
// Geprüft wird auf dem Weg, den der Live-Lauf nimmt (manualByWeek → toRows → replay).
test("Wiedergabe ist mit und ohne zurückgestellte Einträge identisch", async () => {
  const J = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
  const [weekly, cfg, manual] = await Promise.all([J("../data/weekly.json"), J("../config/engine.json"), J("../data/manual.json")]);
  const wochen = weekly.rows.map((r) => r[weekly.columns.indexOf("w")]);
  const maps = (m) => manualByWeek(m, wochen);
  const verschmutzt = {
    ...manual,
    reserve_risk: [{ d: "2026-10-04", v: 0.00175 }, { d: "2026-11-01", v: 0.00175 }],
    rhodl: wochen.slice(-40).map((w) => ({ d: w, v: 0.1 })),
    lth_net_position_change: wochen.slice(-40).map((w) => ({ d: w, v: -262832 })),
  };
  const sauber = replay(toRows(weekly, { manual: maps(manual) }), cfg);
  const schmutz = replay(toRows(weekly, { manual: maps(verschmutzt) }), cfg);
  assert.deepEqual(schmutz.events.map((e) => e.id), sauber.events.map((e) => e.id));
  assert.deepEqual(schmutz.weeks.at(-1).engines.buy.score, sauber.weeks.at(-1).engines.buy.score);
  assert.deepEqual(schmutz.weeks.at(-1).engines.sell.coverage, sauber.weeks.at(-1).engines.sell.coverage);
  assert.equal(schmutz.state.phase, sauber.state.phase);
});

test("manualByWeek: eine Lesung gilt für ihre Woche und 30 Tage danach, dann nicht mehr", () => {
  const wochen = ["2026-06-28", "2026-07-05", "2026-07-12", "2026-07-26", "2026-08-02", "2026-08-09"];
  const m = manualByWeek({ supply_in_profit: [{ d: "2026-07-01", v: 48.45 }], sth_realized_price: [{ d: "2026-07-01", v: 69021 }] }, wochen);
  assert.deepEqual(Object.keys(m.supply_loss), ["2026-07-05", "2026-07-12", "2026-07-26"]);
  assert.ok(Math.abs(m.supply_loss["2026-07-05"] - 51.55) < 1e-9, "Angebot im Verlust ist 100 minus Angebot im Gewinn");
  assert.equal(m.sth_rp["2026-07-26"], 69021);
  assert.deepEqual(m.reserve_risk, {});
});

// Regressionsanker für den Nachtrag vom 17.11.2026 (HANDOFF §13): Mit den nachgetragenen
// Monatslesungen beginnt Phase 1 am 12.07.2026 und Phase 2 am 30.08.2026. Verschwindet
// einer der beiden Wechsel, hat sich der angezeigte Zustand geändert, ohne dass am Markt
// etwas passiert ist: Dann ist eine Lesung verloren gegangen oder verändert worden.
// Der Wochenlauf bricht in diesem Fall absichtlich hier ab, statt still weiterzurechnen.
test("Nachtrag: die Phasenwechsel vom Sommer 2026 hängen an den Handwerten und stehen", async () => {
  const J = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
  const [weekly, cfg, manual] = await Promise.all([J("../data/weekly.json"), J("../config/engine.json"), J("../data/manual.json")]);
  const wochen = weekly.rows.map((r) => r[weekly.columns.indexOf("w")]);
  const mit = replay(toRows(weekly, { manual: manualByWeek(manual, wochen) }), cfg);
  const ids = new Set(mit.events.map((e) => e.id));
  assert.ok(ids.has("2026-07-12:PHASE_CHANGE"), "Phase 1 am 12.07.2026 fehlt: data/manual.json prüfen (Lesungen Juni bis August 2026)");
  assert.ok(ids.has("2026-08-30:PHASE_CHANGE"), "Phase 2 am 30.08.2026 fehlt: data/manual.json prüfen (Lesungen Juli bis September 2026)");
  // Bis Ende 2025 ist der Verlauf mit und ohne Handwerte derselbe.
  const ohne = replay(toRows(weekly), cfg);
  const alt = (run) => run.events.filter((e) => e.week_id < "2026-01-01").map((e) => e.id);
  assert.deepEqual(alt(mit), alt(ohne));
});
