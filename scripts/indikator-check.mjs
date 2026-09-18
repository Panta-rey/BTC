#!/usr/bin/env node
// Panta Rey · Ampel – Frühwarnung: verlieren Indikatoren ihre Aussagekraft?
//
// Läuft gegen data/weekly.json, braucht keine bezahlten Quellen und kann deshalb
// im Runner laufen. Er ändert nichts, er misst nur, und er schreibt
// reports/indikator-check.md.
//
// Hintergrund: Die Zyklen werden flacher. Ein Indikator kann auf zwei Arten
// unbrauchbar werden, und beide sind still.
//   · Er verstummt. Reicht nie mehr an die Zone heran, trägt nichts mehr bei.
//   · Er ruft dauernd. Steht praktisch immer in der Zone und hebt den Score
//     konstant an, ohne noch etwas zu unterscheiden. Das ist der gefährlichere
//     Fall, und genau so verhält sich Reserve Risk seit 2022 (HANDOFF §4a).
//
// Zwei Ebenen:
//   A  Je Indikator der Anteil der Wochen in Zone, gesamt und je Zyklus.
//      Harte Zahl, unabhängig davon, warum ein Indikator driftet.
//   B  Das Grundmodell selbst. Schwächer, weil die Zyklusgrenzen aus eben
//      diesem Modell stammen. Die vier Prüfungen messen aber Dinge, die auch
//      ohne Modell gelten: Rückgangstiefe, Zeitfenster, Schweigedauer, Gleichlauf.
//
// Aufruf:  node scripts/indikator-check.mjs

import { readJSON, writeJSON } from "./lib/store.mjs";
import { toRows } from "../engine/rows.mjs";
import { scoreIndicators } from "../engine/engines.mjs";
import { replay } from "../engine/phases.mjs";
import { daysBetween } from "../engine/dates.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const weekly = await readJSON("data/weekly.json");
const cfg = await readJSON("config/engine.json");
const manual = await readJSON("data/manual.json", null);
if (!weekly || !cfg) { console.error("data/weekly.json oder config/engine.json fehlt."); process.exit(1); }

const IN_ZONE = cfg.in_zone_score ?? 70;
const rows = toRows(weekly, { manual: manual ?? undefined });
const run = replay(rows, cfg);

// Zyklen von Tief zu Tief (SPEC Anhang A). Der laufende endet offen.
const TIEFS = ["2015-01-14", "2018-12-15", "2022-11-21"];
const HOCHS = ["2013-12-04", "2017-12-17", "2021-11-10", "2025-10-06"];
const ZYKLEN = [];
let vorher = rows[0]?.w ?? "2009-01-01";
for (const t of TIEFS) { ZYKLEN.push({ name: `bis ${t.slice(0, 4)}`, von: vorher, bis: t }); vorher = t; }
ZYKLEN.push({ name: `seit ${vorher.slice(0, 4)}`, von: vorher, bis: "2099-01-01" });

// ---------------------------------------------------------------- Ebene A

// Score je Indikator und Woche, mit derselben Funktion wie im Live-Betrieb.
const verlauf = [];
for (let i = 0; i < rows.length; i++) {
  verlauf.push({ w: rows[i].w, s: scoreIndicators(rows[i], rows.slice(0, i), cfg) });
}

const ids = [...new Set(Object.keys(cfg.anchors.buy).concat(Object.keys(cfg.anchors.sell)))].sort();
const familieVon = {};
for (const seite of ["buy", "sell"]) {
  for (const [fid, f] of Object.entries(cfg.engines[seite].families)) {
    for (const id of Object.keys(f.members ?? {})) (familieVon[`${seite}:${id}`] = f.label ?? fid);
  }
}

function anteil(id, seite, von, bis) {
  const rel = verlauf.filter(v => v.w >= von && v.w <= bis)
    .map(v => (seite === "buy" ? v.s[id]?.score_buy : v.s[id]?.score_sell))
    .filter(x => x != null);
  return rel.length ? { n: rel.length, pct: (rel.filter(x => x >= IN_ZONE).length / rel.length) * 100 } : null;
}

// Überblick je Motor. Die Einzeltabelle zeigt Bäume, diese Zeilen den Wald:
// Erreicht ein Motor seine Zone überhaupt noch?
const ZONE_MIN = { buy: cfg.engines.buy.score_min ?? 60, sell: cfg.engines.sell.score_min ?? 60 };
const motorUeberblick = ["buy", "sell"].map(seite => {
  const je = ZYKLEN.map(z => {
    const rel = run.weeks.filter(w => w.w >= z.von && w.w <= z.bis)
      .map(w => (seite === "buy" ? w.buy : w.sell)).filter(x => x != null);
    if (!rel.length) return { ...z, a: null };
    return { ...z, a: { n: rel.length, max: Math.max(...rel),
      inZone: (rel.filter(x => x >= ZONE_MIN[seite]).length / rel.length) * 100 } };
  });
  return { seite, je };
});

const ebeneA = [];
for (const seite of ["buy", "sell"]) {
  for (const id of ids) {
    if (!cfg.anchors[seite][id]) continue;
    const gesamt = anteil(id, seite, "0000", "9999");
    if (!gesamt || gesamt.n < 60) continue;
    const je = ZYKLEN.map(z => ({ ...z, a: anteil(id, seite, z.von, z.bis) }));
    const werte = je.filter(z => z.a && z.a.n >= 30).map(z => z.a.pct);
    const jetzt = je.at(-1)?.a?.pct ?? null;
    const spanne = werte.length > 1 ? Math.max(...werte) - Math.min(...werte) : 0;
    let urteil = "unauffällig", schwere = 0;
    if (jetzt != null && jetzt >= 60) { urteil = "ruft dauernd"; schwere = 3; }
    else if (jetzt != null && jetzt <= 1) { urteil = "verstummt"; schwere = 2; }
    else if (spanne > 40) { urteil = "driftet stark"; schwere = 1; }
    ebeneA.push({ id, seite, familie: familieVon[`${seite}:${id}`] ?? "–",
      gesamt: gesamt.pct, n: gesamt.n, je, jetzt, spanne, urteil, schwere,
      richtung: werte.length > 1 ? Math.sign(werte.at(-1) - werte[0]) : 0 });
  }
}
ebeneA.sort((a, b) => b.schwere - a.schwere || b.spanne - a.spanne);

// ---------------------------------------------------------------- Ebene B

const letzte = rows.at(-1);
const ereignisse = run.events ?? [];
// Signale heissen im Ereignisstrom TRANCHE_DUE, nicht BUY oder SELL.
const letztesSignal = [...ereignisse].reverse().find(e => e.type === "TRANCHE_DUE");
const wochenOhneSignal = letztesSignal ? Math.round(daysBetween(letztesSignal.week_id ?? letztesSignal.w, letzte.w) / 7) : rows.length;

// Tiefster Rückgang je Zyklus gegen die Torschwelle von Tor B
const rueckgang = ZYKLEN.map(z => {
  const rel = rows.filter(r => r.w >= z.von && r.w <= z.bis && r.drawdown != null);
  return { name: z.name, tiefst: rel.length ? Math.min(...rel.map(r => r.drawdown)) : null };
});
const schwelle = cfg.gates.buy_B.drawdown_max;

// Lage der Tiefs im erwarteten Zeitfenster nach dem Hoch
const fenster = cfg.cycle_windows?.low_after_high_months ?? [9, 16];
const timing = TIEFS.map((t, i) => {
  const h = HOCHS[i];
  if (!h) return { tief: t, hoch: null };
  const monate = daysBetween(h, t) / 30.44;
  return { tief: t, hoch: h, monate, drin: monate >= fenster[0] && monate <= fenster[1] };
});

const gleichlauf = ebeneA.filter(x => x.spanne > 25);
const hoch = gleichlauf.filter(x => x.richtung > 0).length;
const runter = gleichlauf.filter(x => x.richtung < 0).length;

// ---------------------------------------------------------------- Bericht

const f1 = v => (v == null ? "–" : v.toFixed(1));
const L = [];
L.push("# Indikator-Prüfung", "");
L.push(`Erstellt ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Konfiguration \`${cfg.version}\` · ${rows.length} Wochen bis ${letzte.w}`, "");
L.push("Diese Prüfung ändert nichts. Sie misst, ob die Indikatoren noch unterscheiden, was sie unterscheiden sollen. Ein Befund ist ein Eintrag für die Neubewertung nach dem Zyklusende, keine Änderung an der laufenden Konfiguration (SPEC 10.5).", "");

const auffaellig = ebeneA.filter(x => x.schwere > 0);
L.push("## Kurzfassung", "");
L.push(auffaellig.length
  ? `${auffaellig.length} von ${ebeneA.length} Indikatorrollen sind auffällig: ${auffaellig.filter(x => x.urteil === "ruft dauernd").length} rufen dauernd, ${auffaellig.filter(x => x.urteil === "verstummt").length} sind verstummt, ${auffaellig.filter(x => x.urteil === "driftet stark").length} driften stark.`
  : `Keine der ${ebeneA.length} Indikatorrollen ist auffällig.`, "");
L.push(`Letztes Kauf- oder Verkaufssignal vor ${wochenOhneSignal} Wochen. Gleichlauf: ${hoch} Indikatoren driften nach oben, ${runter} nach unten.`, "");

L.push("## A. Überblick: erreichen die Motoren ihre Zone noch?", "");
L.push(`Bevor es um einzelne Indikatoren geht, die Gesamtsicht. Gezeigt wird je Zyklus der höchste erreichte Motorwert und der Anteil der Wochen, in denen der Motor seine Zone erreicht hat. Ein Motor, dessen Höchstwert von Zyklus zu Zyklus fällt, verliert seine Fähigkeit, überhaupt auszulösen.`, "");
L.push("| Motor | Wert | " + ZYKLEN.map(z => z.name).join(" | ") + " |");
L.push("|---|---|" + ZYKLEN.map(() => "---|").join(""));
for (const m of motorUeberblick) {
  const nam = m.seite === "buy" ? "Kauf" : "Verkauf";
  L.push(`| ${nam} | höchster Wert | ` + m.je.map(z => (z.a ? Math.round(z.a.max) : "–")).join(" | ") + " |");
  L.push(`| ${nam} | Wochen in Zone (ab ${ZONE_MIN[m.seite]}) | ` + m.je.map(z => (z.a ? f1(z.a.inZone) + " %" : "–")).join(" | ") + " |");
}
L.push("");
// Die entscheidende Rechnung: Reicht der höchste Motorwert des laufenden Zyklus
// überhaupt noch über die Schwelle von Weg E2? Die ist an die Abdeckung gekoppelt,
// also einmal bei voller Datenlage und einmal beim heutigen Stand prüfen.
const sellMax = motorUeberblick.find(m => m.seite === "sell").je.filter(z => z.a).map(z => z.a.max);
const e2 = cfg.gates.sell_E2;
const cov = run.weeks.at(-1)?.sell_cov ?? null;
if (sellMax.length >= 2) {
  const jetzt = sellMax.at(-1), vorher = Math.max(...sellMax.slice(0, -1));
  L.push(`Höchstwerte des Verkaufs-Motors über die Zyklen: ${sellMax.map(x => Math.round(x)).join(" → ")}. ` +
    (jetzt < vorher * 0.75
      ? `Der laufende Zyklus bleibt deutlich unter dem besten früheren Wert (${Math.round(vorher)}).`
      : `Der laufende Zyklus liegt im Rahmen der früheren.`), "");

  const voll = e2.score_min;
  const heute = e2.scale_by_coverage && cov != null ? voll * cov : voll;
  L.push("| Weg E2 verlangt | Schwelle | höchster Wert ${Y} | reicht? |".replace("${Y}", "im laufenden Zyklus"),
         "|---|---|---|---|");
  L.push(`| bei voller Datenlage | ${voll} | ${Math.round(jetzt)} | ${jetzt >= voll ? "✓" : "**✗**"} |`);
  if (cov != null && Math.abs(heute - voll) > 0.5)
    L.push(`| bei heutiger Abdeckung (${Math.round(cov * 100)} %) | ${Math.round(heute)} | ${Math.round(jetzt)} | ${jetzt >= heute ? "✓" : "**✗**"} |`);
  L.push("");
  if (jetzt < voll) {
    L.push(`**Das ist der wichtigste Befund dieser Prüfung.** Mit vollständigen Daten hätte der Verkaufs-Motor im gesamten laufenden Zyklus an keiner einzigen Woche ausgelöst: Sein Höchstwert von ${Math.round(jetzt)} lag nie über der Schwelle von ${voll}. Es fehlten also nicht ein paar Punkte in einer Woche, sondern im ganzen Zyklus.` +
      (cov == null || heute >= voll ? ""
        : jetzt >= heute
          ? ` Bei der heutigen Abdeckung liegt die Schwelle bei ${Math.round(heute)}, es hat also ausgelöst. Der Puffer beträgt aber nur ${Math.round(jetzt - heute)} Punkte: Fällt das nächste Hoch noch etwas flacher aus, meldet die Verkaufsseite nichts mehr.`
          : ` Auch bei der heutigen, abgesenkten Schwelle von ${Math.round(heute)} reicht es nicht.`), "");
  }
}

L.push("## B. Einzelne Indikatoren", "");
L.push(`Anteil der Wochen, in denen ein Indikator mindestens Score ${IN_ZONE} erreicht, also „in Zone" steht. **Ruft dauernd** heisst 60 % oder mehr im laufenden Zyklus: Der Indikator hebt den Motor konstant an, ohne noch zu unterscheiden. **Verstummt** heisst 1 % oder weniger. **Driftet stark** heisst über 40 Prozentpunkte Unterschied zwischen den Zyklen.`, "");
L.push("| Indikator | Rolle | Familie | gesamt | " + ZYKLEN.map(z => z.name).join(" | ") + " | Urteil |");
L.push("|---|---|---|---|" + ZYKLEN.map(() => "---|").join("") + "---|");
for (const x of ebeneA) {
  const zellen = x.je.map(z => (z.a && z.a.n >= 30 ? f1(z.a.pct) + " %" : "–")).join(" | ");
  const mark = x.schwere >= 2 ? `**${x.urteil}**` : x.urteil;
  L.push(`| ${x.id} | ${x.seite === "buy" ? "Kauf" : "Verkauf"} | ${x.familie} | ${f1(x.gesamt)} % | ${zellen} | ${mark} |`);
}
L.push("");

L.push("## C. Trägt das Grundmodell noch?", "");
L.push("Diese Prüfungen sind schwächer als die Teile A und B, weil die Zyklusgrenzen selbst aus dem Modell stammen. Sie messen aber Grössen, die auch dann noch aussagen, wenn der Zyklus nicht mehr greift.", "");

L.push("**1. Schweigen.**", "");
L.push(!ereignisse.length
  ? "Der Lauf hat überhaupt keine Ereignisse erzeugt. Das deutet auf unvollständige Eingangsdaten hin, nicht auf Schweigen des Systems."
  : !letztesSignal
  ? `In der gesamten Historie (${rows.length} Wochen) wurde nie eine Tranche fällig. **Das wäre ein Befund, der das ganze Modell in Frage stellt.**`
  : wochenOhneSignal > 208
  ? `Seit ${wochenOhneSignal} Wochen kein Kauf- oder Verkaufssignal, also über einen vollen Zyklus hinweg. **Das ist für sich schon eine Aussage.**`
  : `Letztes Signal vor ${wochenOhneSignal} Wochen (${letztesSignal.week_id}). Unauffällig, ein voller Zyklus wären 208.`, "");

L.push("**2. Wird der Rückgang zu flach?** Tor B verlangt mindestens " + schwelle + " % unter dem Hoch. Bleibt ein Bärenmarkt darüber, öffnet kein Tor, egal wie gut die Indikatoren sind.", "");
L.push("| Zyklus | tiefster Rückgang | Abstand zur Torschwelle |", "|---|---|---|");
for (const r of rueckgang) {
  const ab = r.tiefst == null ? null : r.tiefst - schwelle;
  L.push(`| ${r.name} | ${f1(r.tiefst)} % | ${ab == null ? "–" : (ab <= 0 ? `${f1(-ab)} Punkte Luft` : `**${f1(ab)} Punkte zu flach**`)} |`);
}
L.push("");

L.push(`**3. Stimmen die Zeitfenster?** Die Tiefs kamen bisher ${fenster[0]} bis ${fenster[1]} Monate nach dem Hoch. Fällt ein Wendepunkt weit daneben, war er nicht mehr vom Zyklus getrieben.`, "");
L.push("| Hoch | Tief | Abstand | im Fenster |", "|---|---|---|---|");
for (const t of timing) {
  if (!t.hoch) { L.push(`| – | ${t.tief} | – | – |`); continue; }
  L.push(`| ${t.hoch} | ${t.tief} | ${f1(t.monate)} Monate | ${t.drin ? "✓" : "**✗**"} |`);
}
L.push("");

L.push("**4. Gleichlauf.** Driftet ein Indikator, ist das Zufall. Driften viele gleichzeitig in dieselbe Richtung, ist es ein Regimewechsel.", "");
L.push(gleichlauf.length < 3
  ? `Nur ${gleichlauf.length} Indikatoren driften nennenswert. Kein Muster.`
  : `${gleichlauf.length} Indikatoren driften nennenswert, davon ${hoch} nach oben und ${runter} nach unten. ${Math.max(hoch, runter) >= gleichlauf.length * 0.75 ? "**Der überwiegende Teil zeigt in dieselbe Richtung.** Das spricht für einen Regimewechsel, nicht für Zufall." : "Die Richtungen sind gemischt, das spricht eher gegen einen gemeinsamen Grund."}`, "");

L.push("---", "");
L.push("**Was diese Prüfung nicht kann.** Sie kann nicht beweisen, dass der Zyklus zu Ende ist, und sie warnt nicht rechtzeitig. Bei vier Zyklen ist ein fünfter, der abweicht, statistisch bedeutungslos; erst der sechste wäre ein Muster. Ihr Nutzen ist bescheidener: Sie verwandelt ein Unbehagen in datierte Zahlen, mit denen sich entscheiden lässt.", "");

const md = L.join("\n") + "\n";
await mkdir("reports", { recursive: true });
await writeFile("reports/indikator-check.md", md);
await writeJSON("reports/indikator-check.json", {
  erstellt: new Date().toISOString(), config_version: cfg.version, wochen: rows.length, bis: letzte.w,
  auffaellig: auffaellig.map(({ id, seite, urteil, jetzt, spanne }) => ({ id, seite, urteil, jetzt, spanne })),
  wochen_ohne_signal: wochenOhneSignal, rueckgang, timing, gleichlauf: { hoch, runter },
}, { pretty: true });

console.log(md);
console.log("Bericht: reports/indikator-check.md");
if (auffaellig.length) process.exitCode = 0;   // Befund ist kein Fehler
