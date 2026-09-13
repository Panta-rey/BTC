#!/usr/bin/env node
// Panta Rey · Ampel – Ankerpunkte und monatliche Handeingabe prüfen (nur lokal)
//
// Zwei Fragen, die sich erst mit der vollständigen BGeometrics-Historie beantworten
// lassen. Beide betreffen Kennzahlen, die **heute im Einsatz** sind, nicht mögliche
// Erweiterungen. Der Bericht ändert nichts, er misst nur.
//
//   Teil A  Sind die Ankerpunkte erreichbar und sitzen sie richtig?
//           Die absoluten Anker für Reserve Risk und das Angebot im Verlust stammen
//           aus veröffentlichten Bändern und wurden nie gegen echte Daten gehalten
//           (HANDOFF §4). Geprüft wird: Welchen Score vergeben sie an den bekannten
//           Zyklustiefs, und auf welchem Perzentil der echten Historie liegt die
//           Score-70-Marke? Liegt sie beim 60. Perzentil, ist der Anker zu locker;
//           liegt sie unter dem 1., ist er unerreichbar.
//
//   Teil B  Kann eine monatliche Handeingabe einen falschen Score erzeugen?
//           Reserve Risk wird hybrid bewertet, also als Maximum aus absolutem Anker
//           und Perzentil. Der Perzentilteil schaltet sich ab 26 belegten Wochen frei.
//           Sieben monatliche Lesungen ergeben rund 28 Wochen, stammen aber aus nur
//           sieben Messpunkten eines halben Jahres. Ist der neueste der niedrigste,
//           liegt er formal weit unten und der Indikator käme fälschlich in Zone.
//           Geprüft wird das gegen die echte Vier-Jahres-Historie, für jeden
//           möglichen Startmonat der letzten 16 Jahre.
//
// Aufruf:  node scripts/local/anker-check.mjs
//          node scripts/local/anker-check.mjs --monate=24   Länge je Probelauf

import { readJSON, writeJSON } from "../lib/store.mjs";
import { anchorScore, percentile, score as hybridScore } from "../../engine/normalize.mjs";
import { LOWS, HIGHS } from "../lib/sim.mjs";
import { daysBetween } from "../../engine/dates.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const P = process.argv.find((a) => a.startsWith("--in="))?.split("=")[1] ?? "data/private";
const MONATE = Number(process.argv.find((a) => a.startsWith("--monate="))?.split("=")[1] ?? 24);

const weekly = await readJSON("data/weekly.json");
const cfg = await readJSON("config/engine.json");
if (!weekly || !cfg) { console.error("data/weekly.json oder config/engine.json fehlt."); process.exit(1); }

const wochen = weekly.rows.map((r) => r[0]);
const MANUAL_MAX_AGE = 30;                       // wie in build.mjs
const WIN = cfg.percentile?.window_weeks ?? 208;
const FLOOR = cfg.percentile?.floor_weeks ?? 26;
const MIN = cfg.percentile?.min_weeks ?? 104;
const IN_ZONE = cfg.in_zone_score ?? 70;

// ---------------------------------------------------------------- Kennzahlen unter Prüfung

const PRUEFUNG = [
  { id: "reserve_risk", name: "Reserve Risk", datei: "reserve_risk.json", motor: "buy",
    anker: cfg.anchors.buy.reserve_risk, richtung: "tief_ist_kauf",
    hinweis: "wird monatlich von Hand eingetragen" },
  { id: "supply_loss", name: "Angebot im Verlust", datei: "supply_in_profit_pct.json", motor: "buy",
    anker: cfg.anchors.buy.supply_loss, transform: (v) => 100 - v, richtung: "hoch_ist_kauf",
    hinweis: "wird monatlich von Hand eingetragen, aus dem Angebot im Gewinn gerechnet" },
  { id: "rhodl", name: "RHODL-Ratio", datei: "rhodl.json", motor: "sell",
    anker: cfg.anchors.sell.rhodl, richtung: "hoch_ist_verkauf",
    hinweis: "zurückgestellt (HANDOFF §4a), hier nur zur Vollständigkeit" },
  { id: "lth_dist", name: "Abgabe der Langzeithalter", datei: "lth_net_position.json", motor: "sell",
    anker: cfg.anchors.sell.lth_dist, transform: (v) => -v, richtung: "hoch_ist_verkauf",
    hinweis: "zurückgestellt (HANDOFF §4a)" },
];

// ---------------------------------------------------------------- Hilfen

// Tagesreihe auf die Wochenschlüsse abbilden (Sonntagswert oder bis 10 Tage davor).
function aufWochen(values, transform = (v) => v) {
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

// Eine Lesung je Monat, wie beim Eintragen von Hand. Gültig 30 Tage, wie in build.mjs.
function monatsLesungen(values, abDatum) {
  const proMonat = new Map();
  for (const [d, v] of values) {
    if (d < abDatum) continue;
    const m = d.slice(0, 7);
    if (!proMonat.has(m)) proMonat.set(m, [d, v]);   // erster verfügbarer Tag des Monats
  }
  return [...proMonat.values()];
}

function lesungenAufWochen(lesungen, transform = (v) => v) {
  const out = {};
  for (const w of wochen) {
    let best = null;
    for (const [d, v] of lesungen) if (d <= w && daysBetween(d, w) <= MANUAL_MAX_AGE) best = v;
    if (best != null) out[w] = transform(best);
  }
  return out;
}

// Score einer Woche, exakt nach der Logik von engines.mjs: Perzentil über das
// Fenster der belegten Wochen, Untergrenze FLOOR, danach hybrid mit dem Anker.
function scoreFolge(nachWoche, anker) {
  const out = {};
  const fenster = [];
  for (const w of wochen) {
    const v = nachWoche[w];
    if (v == null) { out[w] = null; continue; }
    const brauchbar = [...fenster.slice(-(WIN - 1)).filter((x) => x != null), v];
    let pct = null, basis = "zu_kurz";
    if (brauchbar.length >= FLOOR) {
      pct = percentile(brauchbar, v);
      basis = brauchbar.length < Math.min(MIN, WIN) ? "kurz" : "voll";
    }
    out[w] = { v, pct, basis, n: brauchbar.length, score: hybridScore(anker, v, pct) };
    fenster.push(v);
  }
  return out;
}

const fensterUm = (datum, wochenPlus = 4) =>
  wochen.filter((w) => Math.abs(daysBetween(w, datum)) <= wochenPlus * 7);

// Zyklen von Tief zu Tief. Absolute Ankerpunkte hängen an der Skala, und die wandert
// über die Zyklen. Ein Mittelwert über sechzehn Jahre mischt deshalb Epochen, die
// nichts miteinander zu tun haben. Deswegen alles zusätzlich je Zyklus.
const ZYKLEN = [
  { name: "bis Tief 2015", von: "2009-01-01", bis: "2015-01-14" },
  { name: "2015 → 2018",   von: "2015-01-15", bis: "2018-12-15" },
  { name: "2018 → 2022",   von: "2018-12-16", bis: "2022-11-21" },
  { name: "seit 2022",     von: "2022-11-22", bis: "2099-01-01" },
];

const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const sig = (v) => {
  if (v == null) return "–";
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(2) : a >= 0.01 ? v.toFixed(4) : v.toExponential(2);
};

// ---------------------------------------------------------------- Teil A

const teilA = [];
for (const m of PRUEFUNG) {
  const j = await readJSON(`${P}/${m.datei}`, null);
  if (!j?.values?.length) { teilA.push({ ...m, fehlt: true }); continue; }
  const nachWoche = aufWochen(j.values, m.transform);
  const werte = wochen.map((w) => nachWoche[w]).filter((v) => v != null);
  if (werte.length < 100) { teilA.push({ ...m, fehlt: true }); continue; }

  const sortiert = [...werte].sort((a, b) => a - b);
  const q = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor((p / 100) * sortiert.length))];
  const verteilung = [1, 5, 10, 25, 50, 75, 90, 95, 99].map((p) => ({ p, v: q(p) }));

  // Der Score kommt aus derselben Funktion wie im Live-Betrieb: absolut, Perzentil
  // oder hybrid als Maximum. Das rollende Perzentil sieht nur Vergangenheit.
  const folge = scoreFolge(nachWoche, m.anker);
  const absAnker = m.anker?.abs ?? null;

  // Anteil der Wochen in Zone, gesamt und je Zyklus. Das ist die eigentliche
  // Trennschärfe: Wer in drei von vier Wochen meldet, meldet nichts.
  const inZone = (w) => ((folge[w]?.score ?? null) != null ? folge[w].score >= IN_ZONE : null);
  const anteil = (von, bis) => {
    const rel = wochen.filter((w) => w >= von && w <= bis).map(inZone).filter((x) => x != null);
    return rel.length ? { n: rel.length, pct: (rel.filter(Boolean).length / rel.length) * 100 } : null;
  };
  const gesamt = anteil("0000", "9999");
  const jeZyklus = ZYKLEN.map((z) => ({ ...z, a: anteil(z.von, z.bis) }));

  // Welcher Rohwert markiert die Score-Schwelle? Nur sinnvoll bei absoluten Ankern.
  let markeWert = null, markePct = null;
  if (absAnker) {
    const treffer = sortiert.filter((v) => (anchorScore(absAnker, v) ?? 0) >= IN_ZONE);
    if (treffer.length) {
      markeWert = m.richtung === "tief_ist_kauf" ? Math.max(...treffer) : Math.min(...treffer);
      markePct = percentile(sortiert, markeWert);
    }
  }

  // Wert und tatsächlicher Score an den bekannten Extremen
  const termine = m.motor === "buy" ? LOWS : HIGHS;
  const extreme = [];
  for (const [datum] of termine) {
    const nah = fensterUm(datum).filter((w) => folge[w]?.score != null);
    if (!nah.length) { extreme.push({ datum, v: null }); continue; }
    const beste = nah.reduce((a, w) => (folge[w].score > folge[a].score ? w : a), nah[0]);
    extreme.push({ datum, w: beste, v: folge[beste].v, score: folge[beste].score,
      pct: folge[beste].pct, basis: folge[beste].basis, n: nah.length });
  }

  const alleScores = wochen.map((w) => folge[w]?.score).filter((s) => s != null);
  teilA.push({ ...m, n: werte.length, verteilung, extreme, markeWert, markePct, gesamt, jeZyklus,
    art: absAnker && m.anker?.pct ? "hybrid" : absAnker ? "absolut" : "Perzentil",
    bestScore: alleScores.length ? Math.max(...alleScores) : null,
    medianScore: absAnker ? anchorScore(absAnker, q(50)) : null });
}

// ---------------------------------------------------------------- Teil B

const teilB = [];
for (const m of PRUEFUNG) {
  if (!m.anker?.pct) continue;                       // nur Kennzahlen mit Perzentilteil
  const j = await readJSON(`${P}/${m.datei}`, null);
  if (!j?.values?.length) continue;

  const dichtNachWoche = aufWochen(j.values, m.transform);
  const wahr = scoreFolge(dichtNachWoche, m.anker);

  // Jeder Monat der Historie ist einmal Startmonat einer Handeingabe.
  const startMonate = [...new Set(j.values.map(([d]) => d.slice(0, 7)))].sort();
  const brauchbareStarts = startMonate.filter((mo) => {
    const ende = new Date(Date.parse(mo + "-01T00:00:00Z") + MONATE * 31 * 86400000).toISOString().slice(0, 7);
    return ende <= startMonate.at(-1);
  });

  let laeufe = 0, mitFalsch = 0, falschWochen = 0, gesamtWochen = 0, ersteFreischaltung = [];
  const beispiele = [];
  for (const mo of brauchbareStarts) {
    const ab = mo + "-01";
    const bis = new Date(Date.parse(ab + "T00:00:00Z") + MONATE * 31 * 86400000).toISOString().slice(0, 10);
    const lesungen = monatsLesungen(j.values, ab).filter(([d]) => d <= bis);
    if (lesungen.length < 3) continue;
    const spaerlich = scoreFolge(lesungenAufWochen(lesungen, m.transform), m.anker);

    laeufe++;
    let falschHier = 0, ersteWoche = null;
    for (const w of wochen) {
      if (w < ab || w > bis) continue;
      const s = spaerlich[w], t = wahr[w];
      if (!s || !t) continue;
      if (s.basis !== "zu_kurz" && ersteWoche == null) ersteWoche = { w, n: s.n, lesungen: lesungen.filter(([d]) => d <= w).length };
      gesamtWochen++;
      const sIn = (s.score ?? 0) >= IN_ZONE, tIn = (t.score ?? 0) >= IN_ZONE;
      if (sIn && !tIn) { falschHier++; falschWochen++;
        if (beispiele.length < 6 && falschHier === 1)
          beispiele.push({ start: mo, w, spaerlich: Math.round(s.score), wahr: Math.round(t.score ?? 0),
            pctS: s.pct, pctW: t.pct, n: s.n, lesungen: lesungen.filter(([d]) => d <= w).length });
      }
    }
    if (ersteWoche) ersteFreischaltung.push(ersteWoche.lesungen);
    if (falschHier) mitFalsch++;
  }
  teilB.push({ ...m, laeufe, mitFalsch, falschWochen, gesamtWochen, beispiele,
    lesungenBisFrei: ersteFreischaltung.length
      ? Math.round(ersteFreischaltung.reduce((s, x) => s + x, 0) / ersteFreischaltung.length) : null });
}

// ---------------------------------------------------------------- Bericht

const L = [];
L.push("# Ankerpunkte und monatliche Handeingabe", "");
L.push(`Erstellt ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Konfiguration \`${cfg.version}\` · Probelauf ${MONATE} Monate`, "");
L.push("> Lokale Prüfung gegen den eingefrorenen BGeometrics-Abzug. Sie ändert nichts an der Konfiguration und misst nur, ob die bestehenden Einstellungen zur Wirklichkeit passen. Datenquelle der Prüfreihen: BGeometrics.", "");

L.push("## A. Sitzen die Ankerpunkte?", "");
L.push(`Geprüft wird mit derselben Funktion wie im Live-Betrieb, also absolut, über das Perzentil oder hybrid als Maximum. Zwei Zahlen entscheiden. **Der Anteil der Wochen in Zone** sagt, ob ein Indikator überhaupt unterscheidet: Wer in drei von vier Wochen meldet, hebt den Score nur konstant an. Und **die Lage an den bekannten Extremen** sagt, ob er dann meldet, wenn es darauf ankommt. Beides zusätzlich je Zyklus, weil absolute Ankerpunkte an einer Skala hängen, die über die Zyklen wandert.`, "");

for (const a of teilA) {
  L.push(`### ${a.name}`, "");
  if (a.fehlt) { L.push(`Nicht abgezogen oder zu kurz (\`${a.datei}\`).`, ""); continue; }
  L.push(`${a.hinweis} · Bewertung ${a.art} · ${a.n} Wochen Historie`, "");

  L.push(`**Anteil der Wochen in Zone (Score ab ${IN_ZONE})**`, "");
  L.push("| Zeitraum | Wochen | in Zone |", "|---|---|---|");
  L.push(`| gesamt | ${a.gesamt?.n ?? "–"} | ${a.gesamt ? f1(a.gesamt.pct) + " %" : "–"} |`);
  for (const z of a.jeZyklus) L.push(`| ${z.name} | ${z.a?.n ?? "–"} | ${z.a ? f1(z.a.pct) + " %" : "–"} |`);
  L.push("");
  if (a.gesamt) {
    const p = a.gesamt.pct;
    const urteil = p >= 50 ? "**zu locker.** Der Indikator meldet die meiste Zeit und trennt damit nichts."
      : p >= 30 ? "**grenzwertig locker.** Fast jede dritte Woche in Zone."
      : p >= 3 ? "plausibel. Ein Extremzustand bleibt ein Extremzustand."
      : "**sehr streng.** Der Indikator meldet fast nie.";
    L.push(`Urteil: ${urteil}`, "");
    const spanne = a.jeZyklus.filter((z) => z.a).map((z) => z.a.pct);
    if (spanne.length > 1 && Math.max(...spanne) - Math.min(...spanne) > 35) {
      L.push(`**Achtung, Epochenbruch:** Der Anteil schwankt zwischen ${f1(Math.min(...spanne))} % und ${f1(Math.max(...spanne))} % je Zyklus. Die Gesamtzahl mischt damit Zeiträume, die nicht vergleichbar sind. Massgeblich ist die letzte Zeile.`, "");
    }
  }

  L.push("<details><summary>Verteilung der Rohwerte</summary>", "");
  L.push("| Perzentil | Wert |", "|---|---|");
  for (const d of a.verteilung) L.push(`| ${d.p}. | ${sig(d.v)} |`);
  L.push("", "</details>", "");

  if (a.markeWert != null) {
    L.push(`Die absolute Schwelle für „in Zone" liegt bei ${sig(a.markeWert)}, das ist das ${f1(a.markePct)}. Perzentil der Gesamthistorie. Score am Median: ${f1(a.medianScore)}.`, "");
  }

  L.push(`**An den bekannten ${a.motor === "buy" ? "Zyklustiefs" : "Zyklushochs"}** (bester Score im Fenster von vier Wochen):`, "");
  L.push("| Extrem | Woche | Rohwert | Perzentil | Score | in Zone? |", "|---|---|---|---|---|---|");
  for (const e of a.extreme) {
    if (e.v == null) { L.push(`| ${e.datum} | – | keine Daten | – | – | – |`); continue; }
    L.push(`| ${e.datum} | ${e.w} | ${sig(e.v)} | ${f1(e.pct)} | ${f1(e.score)} | ${(e.score ?? 0) >= IN_ZONE ? "✓" : "✗"} |`);
  }
  L.push("");
  const treffer = a.extreme.filter((e) => (e.score ?? 0) >= IN_ZONE).length;
  const zahl = a.extreme.filter((e) => e.v != null).length;
  L.push(treffer === zahl && zahl > 0
    ? `Alle ${zahl} Extreme liegen in Zone.`
    : `${treffer} von ${zahl} Extremen liegen in Zone. ${treffer === 0 ? "**Der Indikator hat an keinem einzigen Zyklusextrem ausgelöst.**" : ""}`, "");
  if (a.gesamt && treffer === zahl && a.gesamt.pct >= 50) {
    L.push(`Das ist kein Widerspruch, sondern der Kern des Problems: Der Indikator meldet an den Extremen **und** die meiste Zeit dazwischen. Er bestätigt, aber er unterscheidet nicht.`, "");
  }
}

L.push("## B. Was eine monatliche Handeingabe anrichtet", "");
L.push(`Simuliert wird eine Lesung je Monat, gültig 30 Tage, genau wie \`build.mjs\` sie verarbeitet. Jeder Monat der Historie dient einmal als Startmonat, jeder Probelauf dauert ${MONATE} Monate. Verglichen wird der so entstehende Score mit dem Score aus der vollständigen Tageshistorie. Gezählt wird der gefährliche Fall: **die dünne Reihe meldet „in Zone\", die vollständige nicht.**`, "");
if (!teilB.length) {
  L.push("Keine der geprüften Kennzahlen hat einen Perzentilteil, oder die Reihen fehlen.", "");
} else {
  L.push("| Kennzahl | Probeläufe | mit falschem Signal | falsche Wochen | Anteil | Lesungen bis zur Freischaltung |", "|---|---|---|---|---|---|");
  for (const b of teilB) {
    const anteil = b.gesamtWochen ? (b.falschWochen / b.gesamtWochen) * 100 : 0;
    L.push(`| ${b.name} | ${b.laeufe} | ${b.mitFalsch} (${f1(b.laeufe ? (b.mitFalsch / b.laeufe) * 100 : 0)} %) | ${b.falschWochen} von ${b.gesamtWochen} | ${f1(anteil)} % | ${b.lesungenBisFrei ?? "–"} |`);
  }
  L.push("");
  for (const b of teilB) {
    if (!b.beispiele.length) continue;
    L.push(`**${b.name}, die ersten Fälle:**`, "");
    L.push("| Start der Eingabe | Woche | Score dünn | Score wahr | Perzentil dünn | Perzentil wahr | Lesungen |", "|---|---|---|---|---|---|---|");
    for (const e of b.beispiele)
      L.push(`| ${e.start} | ${e.w} | ${e.spaerlich} | ${e.wahr} | ${f1(e.pctS)} | ${f1(e.pctW)} | ${e.lesungen} |`);
    L.push("");
  }
  const schlimm = teilB.filter((b) => b.laeufe && b.mitFalsch / b.laeufe > 0.1);
  L.push(schlimm.length
    ? `**Befund:** Bei ${schlimm.map((b) => b.name).join(" und ")} erzeugt mehr als jeder zehnte Startzeitpunkt mindestens ein falsches Signal. Die Untergrenze von ${FLOOR} Wochen genügt für monatlich eingetragene Werte nicht, weil ${FLOOR} belegte Wochen nur rund ${Math.round(FLOOR / 4.3)} echten Messpunkten entsprechen. Naheliegende Abhilfe, zu entscheiden nach dem Zyklusende: den Perzentilteil erst ab ${MIN} belegten Wochen zulassen oder die Untergrenze an der Zahl der Messpunkte statt der Wochen festmachen.`
    : `**Befund:** Kein Startzeitpunkt erzeugt nennenswert falsche Signale. Die Untergrenze von ${FLOOR} Wochen reicht auch für monatlich eingetragene Werte aus. Die Sorge war unbegründet.`, "");
}

L.push("---", "");
L.push("Beide Teile ändern nichts an `config/engine.json`. Die Konfiguration `1.0` bleibt bis zum Ende des laufenden Zyklus eingefroren (SPEC 10.5).", "");

const md = L.join("\n") + "\n";
await mkdir("reports", { recursive: true });
await writeFile("reports/anker-check.md", md);
await writeJSON("reports/anker-check.json", {
  erstellt: new Date().toISOString(), config_version: cfg.version, monate: MONATE,
  teilA: teilA.map(({ id, name, fehlt, n, markeWert, markePct, bestScore, medianScore, extreme }) =>
    ({ id, name, fehlt: !!fehlt, n, markeWert, markePct, bestScore, medianScore, extreme })),
  teilB: teilB.map(({ id, name, laeufe, mitFalsch, falschWochen, gesamtWochen, lesungenBisFrei }) =>
    ({ id, name, laeufe, mitFalsch, falschWochen, gesamtWochen, lesungenBisFrei })),
}, { pretty: true });

console.log(md);
console.log("Bericht: reports/anker-check.md");
