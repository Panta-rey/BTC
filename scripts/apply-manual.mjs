#!/usr/bin/env node
// Panta Rey · Ampel – manuelle Werte aus einem Issue übernehmen
//
// Wird vom Workflow "Manuelle Werte" aufgerufen. Liest den Issue-Text aus der
// Umgebungsvariablen ISSUE_BODY, prüft ihn streng und schreibt data/manual.json.
// Gibt eine Zusammenfassung auf stdout aus, die als Kommentar ans Issue geht.
//
// Lokal testbar:  ISSUE_BODY="$(cat beispiel.md)" node scripts/apply-manual.mjs --dry-run

import { readJSON, writeJSON } from "./lib/store.mjs";
import { parseSubmission, mergeReadings, KEYS } from "./lib/manual.mjs";

const DRY = process.argv.includes("--dry-run");
const body = process.env.ISSUE_BODY || "";

const res = parseSubmission(body, { today: new Date().toISOString().slice(0, 10) });
if (!res.ok) {
  console.log(`FEHLER: ${res.error}`);
  process.exit(1);
}

const current = await readJSON("data/manual.json", {});
const { next, added, replaced } = mergeReadings(current, res.values);

if (!added && !replaced) {
  console.log("Keine Änderung: die Werte sind schon so hinterlegt.");
  process.exit(0);
}

if (!DRY) await writeJSON("data/manual.json", next, { pretty: true });

const lines = ["Übernommen:", ""];
for (const [k, list] of Object.entries(res.values)) {
  const meta = KEYS[k];
  lines.push(`- **${meta.label}**: ${list.map((r) => `${r.d} → ${r.v}${meta.unit ? " " + meta.unit : ""}`).join(", ")}`);
}
lines.push("", `${added} neue, ${replaced} ersetzte Lesung(en).`,
  "", "Der nächste Wochenlauf rechnet damit. Er läuft montags um 03:10 UTC oder lässt sich unter Actions von Hand starten.");
console.log(lines.join("\n"));
