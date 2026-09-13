#!/usr/bin/env node
// Panta Rey · Ampel – lokaler Vergleich mit den BGeometrics-Daten
//
// Läuft nur auf deinem Rechner und liest data/private/. Der erzeugte Bericht enthält
// Kennzahlen über die Daten (Korrelationen, Abweichungen, Perzentillagen an bekannten
// Wendepunkten), nicht die Daten selbst. Deshalb darf er ins Repo.
//
// Aufruf:  node scripts/local/compare.mjs
//
// Der Bericht beantwortet vier Fragen:
//   1. Wie gut treffen unsere eigenen Ableitungen aus freien Quellen die veröffentlichten Reihen?
//      Dieses Ergebnis gilt auch nach dem Ende des Zugangs.
//   2. Was testen wir überhaupt? Vorab festgehalten, bevor die Zahlen da sind (SPEC 10.5).
//   3. Wird das System besser oder schlechter, wenn die fünf fehlenden Kennzahlen dazukommen?
//   4. Welche der zusätzlichen Kandidaten trennen Zyklustiefs von Zyklushochs überhaupt?

import { readJSON, writeJSON } from "../lib/store.mjs";
import { toRows } from "../../engine/rows.mjs";
import { replay, PHASE_NAMES } from "../../engine/phases.mjs";
import { percentileRank } from "../../engine/series.mjs";
import { simulate, assess, tranchesByWeek, maxDrawdown, LOWS, HIGHS, fmtUSD, fmtBTC } from "../lib/sim.mjs";
import { daysBetween } from "../../engine/dates.mjs";
import { writeFile, mkdir, readdir } from "node:fs/promises";

const P = process.argv.find((a) => a.startsWith("--in="))?.split("=")[1] ?? "data/private";

const weekly = await readJSON("data/weekly.json");
const cfg = await readJSON("config/engine.json");
if (!weekly || !cfg) {
  console.error("data/weekly.json oder config/engine.json fehlt.");
  console.error("weekly.json entsteht im Wochenlauf. Ohne sie lässt sich die Historie nicht abspielen.");
  process.exit(1);
}
const idx = await readJSON(`${P}/_index.json`, null);
if (!idx) {
  console.error(`${P}/ ist leer. Zuerst scripts/local/fetch-bgeometrics.mjs ausführen.`);
  process.exit(1);
}

const wochen = weekly.rows.map((r) => r[0]);
const spalte = (name) => { const i = weekly.columns.indexOf(name); return i < 0 ? [] : weekly.rows.map((r) => r[i]); };

const cache = new Map();
async function laden(id, spalteName = null) {
  const key = `${id}::${spalteName ?? ""}`;
  if (cache.has(key)) return cache.get(key);
  const j = await readJSON(`${P}/${id}.json`, null);
  const v = !j ? null : (spalteName ? j.series?.[spalteName] ?? null : j.values ?? null);
  cache.set(key, v);
  return v;
}

// Tageswerte auf unsere Wochenschlüsse abbilden: Wert vom Sonntag oder bis zu 10 Tage davor.
function aufWochen(values, transform = (v) => v) {
  if (!values) return null;
  const map = new Map(values);
  const out = {};
  for (const w of wochen) {
    for (let k = 0; k <= 10; k++) {
      const d = new Date(Date.parse(w + "T00:00:00Z") - k * 86400000).toISOString().slice(0, 10);
      if (map.has(d)) { out[w] = transform(map.get(d)); break; }
    }
  }
  return out;
}

// Mittelwert der letzten n Tage vor dem Wochenschluss. Für Reihen, die wir selbst glätten.
function aufWochenMittel(values, tage) {
  if (!values) return null;
  const map = new Map(values);
  const out = {};
  for (const w of wochen) {
    const ende = Date.parse(w + "T00:00:00Z");
    let summe = 0, n = 0;
    for (let k = 0; k < tage; k++) {
      const d = new Date(ende - k * 86400000).toISOString().slice(0, 10);
      const v = map.get(d);
      if (v != null) { summe += v; n++; }
    }
    if (n >= Math.max(3, tage / 3)) out[w] = summe / n;
  }
  return out;
}

// ---------------------------------------------------------------- 1. Gegenprobe

// unser = Spalte in weekly.json · id = Datei in data/private · spalte = Unterspalte dort
const VERGLEICHE = [
  { name: "Wochenschluss", unser: "close", id: "price_usd", einheit: "USD", toleranz: 0.5 },
  { name: "Realized Price", unser: "realized_price", id: "realized_price", einheit: "USD", toleranz: 1 },
  { name: "MVRV-Z-Score", unser: "mvrv_z", id: "mvrv_z", einheit: "σ", toleranz: 5 },
  { name: "Puell Multiple", unser: "puell", id: "puell", einheit: "×", toleranz: 10,
    hinweis: "wir bewerten nur die Neuemission ohne Gebühren" },
  { name: "Mayer Multiple", unser: "mayer", id: "mayer", einheit: "×", toleranz: 2 },
  { name: "200-Wochen-Schnitt", unser: "sma200w", id: "sma_200w", einheit: "USD", toleranz: 2 },
  { name: "Pi-Cycle-Nähe", unser: "pi_cycle", id: "pi_cycle_ratio", einheit: "×", toleranz: 3 },
  { name: "Allzeithoch", unser: "ath", id: "ath_stats", spalte: "athPrice", einheit: "USD", toleranz: 1 },
  { name: "Abstand vom Hoch", unser: "drawdown", id: "ath_stats", spalte: "pctBelowAth",
    transform: (v) => -v, einheit: "%", toleranz: 3, absolut: true },
  { name: "Fear & Greed (Woche)", unser: "fng_w", id: "fear_greed", einheit: "Punkte", toleranz: 5, absolut: true },
  { name: "Wikipedia 4 Wochen", unser: "wiki_4w", id: "wikipedia", fenster: 28, einheit: "Aufrufe", toleranz: 15 },
  { name: "Funding 30 Tage", unser: "funding_30d", id: "funding", fenster: 30, einheit: "% / 8 h", toleranz: 100,
    hinweis: "Einheit des Anbieters unbekannt, nur die Korrelation ist aussagekräftig" },
];

function statistik(a, b, { absolut = false } = {}) {
  const paare = a.map((x, i) => [x, b[i]]).filter(([x, y]) => x != null && y != null && Number.isFinite(x) && Number.isFinite(y));
  if (paare.length < 30) return null;
  const n = paare.length;
  const mx = paare.reduce((s, [x]) => s + x, 0) / n, my = paare.reduce((s, [, y]) => s + y, 0) / n;
  let cov = 0, vx = 0, vy = 0, absAbw = 0, relAbw = 0, maxRel = 0, relN = 0;
  for (const [x, y] of paare) {
    cov += (x - mx) * (y - my); vx += (x - mx) ** 2; vy += (y - my) ** 2;
    absAbw += Math.abs(x - y);
    // Bei Reihen um die Null herum (Drawdown, Z-Score) ist die relative Abweichung sinnlos.
    if (!absolut && Math.abs(y) > 1e-9) { const r = Math.abs(x / y - 1); relAbw += r; maxRel = Math.max(maxRel, r); relN++; }
  }
  return {
    n, korrelation: vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null,
    mittlereAbweichung: absAbw / n,
    mittlereRelativeAbweichung: relN ? relAbw / relN : null,
    groessteRelativeAbweichung: relN ? maxRel : null,
    von: paare.length ? a.findIndex((x, i) => x != null && b[i] != null) : null,
  };
}

const gegenprobe = [];
for (const v of VERGLEICHE) {
  const roh = await laden(v.id, v.spalte);
  if (!roh) { gegenprobe.push({ ...v, fehlt: true }); continue; }
  const ihre = v.fenster ? aufWochenMittel(roh, v.fenster) : aufWochen(roh, v.transform ?? ((x) => x));
  const unser = spalte(v.unser);
  const ihrArr = wochen.map((w) => ihre?.[w] ?? null);
  gegenprobe.push({ ...v, stat: statistik(unser, ihrArr, { absolut: v.absolut }) });
}

// ---------------------------------------------------------------- 2. Wirkung auf das System

const pctReihe = await laden("supply_in_profit_pct");
const manualVoll = {
  sth_rp: aufWochen(await laden("sth_realized_price")),
  supply_loss: pctReihe
    ? aufWochen(pctReihe, (v) => 100 - v)
    : aufWochen(await laden("supply_in_profit"), (v) => (v > 1.5 ? 100 - v : 100 - v * 100)),
  reserve_risk: aufWochen(await laden("reserve_risk")),
  rhodl: aufWochen(await laden("rhodl")),
  lth_dist: aufWochen(await laden("lth_net_position"), (v) => -v),
};
const vorhanden = Object.fromEntries(Object.entries(manualVoll).map(([k, v]) => [k, v ? Object.keys(v).length : 0]));

function lauf(manual, label) {
  const rows = toRows(weekly, { manual });
  const run = replay(rows, cfg);
  const sim = simulate(run.weeks, tranchesByWeek(run.events));
  const checks = assess(run, sim.trades);
  const last = run.weeks.at(-1);
  return { label, run, sim, checks, last, wert: sim.btc * last.close + sim.cash, erfuellt: checks.filter((c) => c.ok).length };
}

const ohne = lauf({}, "ohne Zusatzdaten (Stand heute)");
const nurSth = lauf({ sth_rp: manualVoll.sth_rp }, "nur STH-Einstand");
const mit = lauf(manualVoll, "mit allen fünf");

function phasenListe(run) {
  const out = []; let start = run.weeks[0], prev = run.weeks[0];
  for (const w of run.weeks.slice(1).concat([null])) {
    if (!w || w.phase !== prev.phase) { out.push({ von: start.w, bis: prev.w, phase: prev.phase }); start = w; }
    if (!w) break; prev = w;
  }
  return out;
}

// ---------------------------------------------------------------- 3. Trennschärfe der Kandidaten
//
// Eine beschreibende Auswertung, keine Optimierung: Für jede Reihe wird ihre Lage im
// eigenen Vier-Jahres-Perzentil an den bekannten Zyklustiefs und Zyklushochs gemessen
// (SPEC Anhang A, Fenster ± 8 Wochen). Der Abstand zwischen beiden sagt, ob die Reihe
// Wendepunkte überhaupt trennt. Es werden keine Schwellen gesucht und keine gesetzt.

const FENSTER_WOCHEN = 8;
const PCT_MIN = cfg.percentile?.min_weeks ?? 104;
const PCT_WIN = cfg.percentile?.window_weeks ?? 208;

function perzentilReihe(werteNachWoche) {
  // Nur Vergangenheit ansehen, wie im Live-Betrieb (SPEC 10.1).
  const out = {};
  const fenster = [];
  for (const w of wochen) {
    const v = werteNachWoche[w];
    if (v == null) { fenster.push(null); continue; }
    const hist = fenster.filter((x) => x != null).slice(-(PCT_WIN - 1));
    if (hist.length >= PCT_MIN) out[w] = percentileRank([...hist, v], v);
    fenster.push(v);
  }
  return out;
}

function mittelAn(pctNachWoche, termine) {
  const werte = [];
  for (const [datum] of termine) {
    const nah = wochen.filter((w) => Math.abs(daysBetween(w, datum)) <= FENSTER_WOCHEN * 7);
    const p = nah.map((w) => pctNachWoche[w]).filter((x) => x != null);
    if (p.length) werte.push(p.reduce((s, x) => s + x, 0) / p.length);
  }
  return werte.length ? { mittel: werte.reduce((s, x) => s + x, 0) / werte.length, n: werte.length } : null;
}

const schonGenutzt = new Set([
  "price_usd", "ohlc", "realized_price", "mvrv_z", "puell", "mayer", "sma_200w", "pi_cycle",
  "pi_cycle_ratio", "ath_stats", "fear_greed", "wikipedia", "funding", "hashrate", "hashribbons",
  "market_cap", "realized_cap", "btc_issued_usd", "sth_realized_price", "supply_in_profit",
  "supply_in_loss", "supply_in_profit_pct", "reserve_risk", "rhodl", "lth_net_position",
  "mvrv_z_2yr", "golden_ratio",
]);

const dateien = (await readdir(P).catch(() => []))
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .map((f) => f.slice(0, -5));

const kandidaten = [];
for (const id of dateien) {
  if (schonGenutzt.has(id)) continue;
  const j = await readJSON(`${P}/${id}.json`, null);
  if (!j?.values?.length) continue;
  const nachWoche = aufWochen(j.values);
  if (!nachWoche || Object.keys(nachWoche).length < PCT_MIN + 20) continue;
  const pct = perzentilReihe(nachWoche);
  const tief = mittelAn(pct, LOWS), hoch = mittelAn(pct, HIGHS);
  if (!tief || !hoch) continue;
  kandidaten.push({
    id, name: j.name ?? id, gruppe: j.group ?? "?",
    tief: tief.mittel, hoch: hoch.mittel, nTief: tief.n, nHoch: hoch.n,
    trenn: hoch.mittel - tief.mittel,
    wochen: Object.keys(nachWoche).length,
  });
}
kandidaten.sort((a, b) => Math.abs(b.trenn) - Math.abs(a.trenn));

// ---------------------------------------------------------------- Bericht

const L = [];
const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const f2 = (v) => (v == null ? "–" : v.toFixed(2));
const f4 = (v) => (v == null ? "–" : v.toFixed(4));

L.push("# BGeometrics: Vergleich", "");
L.push(`Erstellt ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Konfiguration \`${cfg.version}\` · ${wochen.length} Wochen · ${dateien.length} abgezogene Reihen`, "");
L.push("> Dieser Bericht entstand lokal aus einem zeitlich begrenzten BGeometrics-Zugang. Er enthält Kennzahlen über die Daten, nicht die Daten selbst. Die Rohreihen liegen in `data/private/` und sind von `.gitignore` ausgeschlossen. Datenquelle der Vergleichsreihen: BGeometrics.", "");

// ---- 1
L.push("## 1. Wie gut rechnen wir selbst?", "");
L.push("Mehrere Kennzahlen leiten wir aus freien Quellen ab, statt sie fertig zu beziehen. Hier der Abgleich mit den veröffentlichten Reihen über die gesamte gemeinsame Historie. **Dieses Ergebnis behält seinen Wert auch nach dem Ende des Zugangs**, weil es die freie Pipeline bestätigt oder widerlegt.", "");
L.push("| Kennzahl | Wochen | Korrelation | Ø Abweichung | Ø relativ | grösste relativ | Urteil |", "|---|---|---|---|---|---|---|");
for (const g of gegenprobe) {
  if (g.fehlt) { L.push(`| ${g.name} | – | nicht abgezogen | | | | |`); continue; }
  if (!g.stat) { L.push(`| ${g.name} | zu wenige gemeinsame Wochen | – | | | | |`); continue; }
  const s = g.stat;
  const rel = s.mittlereRelativeAbweichung == null ? null : s.mittlereRelativeAbweichung * 100;
  const urteil = s.korrelation != null && s.korrelation > 0.99 && (rel == null || rel <= g.toleranz) ? "tragfähig"
    : s.korrelation != null && s.korrelation > 0.95 ? "brauchbar" : "prüfen";
  const abw = s.mittlereAbweichung < 1 ? f4(s.mittlereAbweichung) : fmtUSD(s.mittlereAbweichung);
  L.push(`| ${g.name} | ${s.n} | ${f4(s.korrelation)} | ${abw} ${g.einheit} | ${rel == null ? "–" : f1(rel) + " %"} | ${s.groessteRelativeAbweichung == null ? "–" : f1(s.groessteRelativeAbweichung * 100) + " %"} | ${urteil} |`);
}
L.push("");
const hinweise = gegenprobe.filter((g) => g.hinweis && !g.fehlt);
if (hinweise.length) {
  for (const h of hinweise) L.push(`- **${h.name}:** ${h.hinweis}`);
  L.push("");
}
L.push("Eine Korrelation nahe 1 bei kleiner relativer Abweichung heisst: Unsere Ableitung trägt, und die freie Pipeline genügt auch ohne Abo. Ein Teil der verbleibenden Abweichung ist systembedingt und kein Fehler: Die Ampel rechnet durchgehend mit Wochenschlüssen und Tagesschlüssen (SPEC 2.3, HANDOFF §10).", "");

// ---- 2
L.push("## 2. Was hier geprüft wird, vorab festgehalten", "");
L.push("Vier Zyklen sind eine dünne Grundlage. Wer vierzig zusätzliche Reihen gegen sie laufen lässt und nimmt, was am besten aussieht, hat nichts gelernt, sondern nur Rauschen angepasst. SPEC 10.5 verbietet das. Deshalb steht vor den Zahlen, was überhaupt als Ergebnis zählt:", "");
L.push("| Frage | Wie beantwortet | Was ein Ergebnis wäre |", "|---|---|---|");
L.push("| Tragen unsere eigenen Ableitungen? | Abschnitt 1, Korrelation und relative Abweichung | Korrelation unter 0,95 bei einer Kennzahl, die in einen Motor eingeht |");
L.push("| Ändern die fünf fehlenden das Ergebnis? | Abschnitt 3, drei vollständige Durchläufe | Unterschied beim Endvermögen über 3 % **oder** eine andere Zahl erfüllter Kriterien |");
L.push("| Was kostet der fehlende STH-Einstand? | Abschnitt 3, Durchlauf „nur STH-Einstand\" | verschobene Übergänge „Tief bestätigt\" oder „Trendbruch\" |");
L.push("| Lohnen weitere Kennzahlen einen Blick? | Abschnitt 4, Trennschärfe an bekannten Wendepunkten | Trennschärfe über 40 Punkten bei einer Reihe, die keine Familie doppelt |");
L.push("");
L.push("**Erwartung, vor dem Lauf notiert (HANDOFF §11):** Die fünf Kennzahlen verbessern das System nicht, sondern kosten das Verkaufssignal von 2025. Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2 von 32 auf 40, und 2025 hatte einen Score von 36. Trifft das zu, ist die Frage nach einem dauerhaften Abo beantwortet.", "");
L.push("Was Abschnitt 4 ausdrücklich **nicht** tut: Schwellen suchen, Gewichte anpassen oder eine Reihe in einen Motor aufnehmen. Er misst nur, ob eine Reihe Tiefs und Hochs überhaupt unterscheidet. Alles Weitere wäre eine Entscheidung für den nächsten Zyklus, nicht für diese Konfiguration.", "");

// ---- 3
L.push("## 3. Verändern die fünf fehlenden Kennzahlen das Ergebnis?", "");
L.push(`Abgezogene Wochenwerte je Kennzahl: ${Object.entries(vorhanden).map(([k, n]) => `${k} ${n}`).join(" · ")}`, "");
L.push("| Variante | Endvermögen | BTC | Cash | Transaktionen | Kriterien | grösster Rückgang |", "|---|---|---|---|---|---|---|");
for (const v of [ohne, nurSth, mit]) {
  L.push(`| ${v.label} | ${fmtUSD(v.wert)} | ${fmtBTC(v.sim.btc)} | ${fmtUSD(v.sim.cash)} | ${v.sim.trades.length} | ${v.erfuellt} von ${v.checks.length} | ${f1(maxDrawdown(v.sim.equity) * 100)} % |`);
}
L.push("", "Das Endvermögen ist die vergleichbare Grösse, nicht der BTC-Bestand: Ein Durchlauf, der 2025 verkauft hat, hält Cash und weniger BTC (HANDOFF §5).", "");

L.push("### Kriterien im Einzelnen", "");
L.push("| Ereignis | ohne | nur STH | mit allen | Ziel |", "|---|---|---|---|---|");
for (let i = 0; i < ohne.checks.length; i++) {
  const c = ohne.checks[i];
  const z = (v) => { const x = v.checks[i]; return `${x.ok ? "✓" : "✗"} ${x.ratio ? f2(x.ratio) + " ×" : "–"}`; };
  L.push(`| ${c.kind} ${c.date} | ${z(ohne)} | ${z(nurSth)} | ${z(mit)} | ${c.target} |`);
}
L.push("");

L.push("### Phasenwechsel im Vergleich", "");
L.push("Der Trendfilter soll laut Spezifikation Trendband **und** STH-Einstand prüfen (SPEC 5.5). Historisch fehlte der zweite Teil, jeder bisherige Backtest rechnete nur mit dem Band. Hier zeigt sich zum ersten Mal, ob er die Übergänge verschiebt.", "");
const pa = phasenListe(ohne.run), pb = phasenListe(mit.run);
L.push("| # | ohne Zusatzdaten | mit allen fünf | Verschiebung |", "|---|---|---|---|");
for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
  const a = pa[i], b = pb[i];
  const d = a && b && a.von !== b.von ? `${Math.round(daysBetween(a.von, b.von) / 7)} Wochen` : (a && b ? "keine" : "–");
  L.push(`| ${i + 1} | ${a ? `${a.von} → Phase ${a.phase}` : "–"} | ${b ? `${b.von} → Phase ${b.phase}` : "–"} | ${d} |`);
}
L.push("");

L.push("### Aktueller Stand", "");
L.push("| Variante | Phase | seit | Kauf-Motor | Verkauf-Motor | Abdeckung Kauf / Verkauf |", "|---|---|---|---|---|---|");
for (const v of [ohne, mit]) {
  L.push(`| ${v.label} | ${v.last.phase} ${PHASE_NAMES[v.last.phase]} | ${v.run.state.phase_since} | ${v.last.buy} | ${v.last.sell} | ${Math.round(v.last.buy_cov * 100)} % / ${Math.round(v.last.sell_cov * 100)} % |`);
}
L.push("");

// ---- 4
L.push("## 4. Trennen die übrigen Kandidaten Tiefs von Hochs?", "");
L.push(`Für jede zusätzlich abgezogene Reihe steht hier, in welchem Bereich ihrer eigenen Vier-Jahres-Historie sie an den bekannten Zyklustiefs und Zyklushochs lag (SPEC Anhang A, Fenster ± ${FENSTER_WOCHEN} Wochen, nur Vergangenheit sichtbar). Die Trennschärfe ist der Abstand. Ein stark positiver Wert heisst: Die Reihe ist an Hochs oben und an Tiefs unten, taugt also als Verkaufsanzeiger. Ein stark negativer Wert heisst dasselbe umgekehrt.`, "");
L.push("Das ist eine Beschreibung, keine Empfehlung. Eine hohe Trennschärfe allein rechtfertigt keine Aufnahme in einen Motor: Die meisten dieser Reihen messen dasselbe wie eine Kennzahl, die schon drin ist.", "");
if (!kandidaten.length) {
  L.push("Keine Reihe hatte genug Historie für eine Perzentilbetrachtung.", "");
} else {
  L.push("| Reihe | Gruppe | Wochen | Ø Perzentil an Tiefs | Ø Perzentil an Hochs | Trennschärfe |", "|---|---|---|---|---|---|");
  for (const k of kandidaten) {
    L.push(`| ${k.name} | ${k.gruppe} | ${k.wochen} | ${f1(k.tief)} | ${f1(k.hoch)} | ${k.trenn >= 0 ? "+" : ""}${f1(k.trenn)} |`);
  }
  L.push("");
  const stark = kandidaten.filter((k) => Math.abs(k.trenn) >= 40);
  L.push(stark.length
    ? `Über 40 Punkten Trennschärfe: ${stark.map((k) => k.name).join(", ")}. Das ist ein Hinweis für die Bewertung nach dem Ende des laufenden Zyklus, keine Änderung an \`${cfg.version}\`.`
    : "Keine Reihe erreicht 40 Punkte Trennschärfe. Nach dieser Messung bringt keine der zusätzlichen Kennzahlen einen eigenständigen Beitrag.", "");
}

// ---- Schluss
L.push("## Schlussfolgerung", "");
const dWert = ohne.wert ? (mit.wert / ohne.wert - 1) * 100 : 0;
const dKrit = mit.erfuellt - ohne.erfuellt;
const gleich = Math.abs(dWert) < 3 && dKrit === 0;
if (!ohne.sim.trades.length && !mit.sim.trades.length) {
  L.push("In keiner Variante kam es zu Transaktionen. Das deutet auf unvollständige oder künstliche Eingangsdaten hin, nicht auf ein Ergebnis. Bitte prüfen, ob `data/weekly.json` aus einem echten Wochenlauf stammt.");
} else if (dKrit < 0) {
  L.push(`Die Zusatzdaten kosten ein Kriterium (${mit.erfuellt} statt ${ohne.erfuellt}). Das ist genau die in Abschnitt 2 notierte Erwartung: Mit voller Abdeckung steigt die gekoppelte Schwelle von Weg E2, und das knappe Signal von 2025 fällt darunter. **Ein dauerhaftes Abo verbessert das System nach diesen Zahlen nicht.**`);
} else if (gleich) {
  L.push(`Kein belastbarer Unterschied: ${fmtUSD(mit.wert)} gegen ${fmtUSD(ohne.wert)} (${dWert >= 0 ? "+" : ""}${f1(dWert)} %), gleich viele erfüllte Kriterien. **Ein dauerhaftes Abo lohnt sich nach diesen Zahlen nicht.**`);
} else if (dKrit > 0 && dWert > 0) {
  L.push(`Die Zusatzdaten verbessern beides: ${fmtUSD(mit.wert)} gegen ${fmtUSD(ohne.wert)} (${dWert >= 0 ? "+" : ""}${f1(dWert)} %) bei ${mit.erfuellt} statt ${ohne.erfuellt} erfüllten Kriterien. **Ein dauerhaftes Abo wäre begründbar.** Vorher die Empfindlichkeitsprüfung aus SPEC 10.3 wiederholen, weil sich Abdeckung und gekoppelte Schwellen ändern.`);
} else {
  L.push(`Gemischtes Bild: Endvermögen ${dWert >= 0 ? "+" : ""}${f1(dWert)} %, erfüllte Kriterien ${dKrit >= 0 ? "+" : ""}${dKrit}. Die Tabelle der Phasenwechsel zeigt, wo sich die Signale verschieben.`);
}
L.push("");
const sthAnders = phasenListe(nurSth.run).some((p, i) => pa[i] && p.von !== pa[i].von);
L.push(sthAnders
  ? "**Der STH-Einstand allein verschiebt bereits Übergänge.** Der Trendfilter arbeitet damit zum ersten Mal in der Form, die SPEC 5.5 vorsieht. Unabhängig von der Abo-Frage gehört dieser Befund in HANDOFF §4."
  : "Der STH-Einstand allein verschiebt keinen Übergang. Der vereinfachte Trendfilter, der nur das Bull Market Support Band prüft, kam historisch also zum selben Ergebnis.");
L.push("", "Wichtig: Vier Zyklen sind eine dünne Grundlage. Ein Unterschied von wenigen Prozent ist Rauschen, kein Beleg.", "");

const md = L.join("\n") + "\n";
await mkdir("reports", { recursive: true });
await writeFile("reports/bgeometrics-vergleich.md", md);
await writeJSON("reports/bgeometrics-vergleich.json", {
  erstellt: new Date().toISOString(), config_version: cfg.version, reihen: dateien.length,
  gegenprobe: gegenprobe.map(({ name, id, stat, fehlt }) => ({ name, id, stat, fehlt: !!fehlt })),
  varianten: [ohne, nurSth, mit].map((v) => ({
    label: v.label, wert: v.wert, btc: v.sim.btc, cash: v.sim.cash,
    trades: v.sim.trades.length, erfuellt: v.erfuellt, phase: v.last.phase,
  })),
  kandidaten,
}, { pretty: true });

console.log(md.split("## 2.")[0]);
console.log(`Vollständiger Bericht: reports/bgeometrics-vergleich.md`);
console.log(`Kandidaten bewertet: ${kandidaten.length}`);
