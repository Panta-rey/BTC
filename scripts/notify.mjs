#!/usr/bin/env node
// Panta Rey · Ampel – Benachrichtigungen (Meilenstein M5)
//
// Verschickt neue Ereignisse aus data/events.json. Zwei Kanäle:
//   1. GitHub Issue (Standard). Löst E-Mail und, mit der GitHub-App, eine Push-Nachricht aus.
//      Das offene Issue ist zugleich die Quittung: schliessen, wenn erledigt.
//   2. ntfy.sh (optional, Secret NTFY_TOPIC). Reine Push-Nachricht.
//
// Aufruf:
//   node scripts/notify.mjs            verschicken
//   node scripts/notify.mjs --dry-run  nur anzeigen, nichts senden und nichts speichern
//   node scripts/notify.mjs --test     Testmeldung erzeugen und verschicken
//
// Beträge werden nie verschickt: die Position lebt nur im Browser.

import { readJSON, writeJSON } from "./lib/store.mjs";
import { selectPending, body, stale, yearlyReview, KIND } from "./lib/events.mjs";

const DRY = process.argv.includes("--dry-run");
const TEST = process.argv.includes("--test");
const NOW = Date.now();

const REPO = process.env.GITHUB_REPOSITORY || "Panta-rey/Panta-Rey-BTC-Ampel";
const TOKEN = process.env.GITHUB_TOKEN || "";
const NTFY = process.env.NTFY_TOPIC || "";
const SITE = `https://${REPO.split("/")[0].toLowerCase()}.github.io/${REPO.split("/")[1]}/`;

const nf = (v) => (v == null ? null : Math.round(v).toLocaleString("de-CH").replace(/[\u2019\u202F\u00A0]/g, "'"));

// ---------------------------------------------------------------- Kanäle

async function ghIssue(title, text, label) {
  if (!TOKEN) return { ok: false, why: "kein GITHUB_TOKEN" };
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, body: text, labels: [label] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { ok: false, why: `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` };
  return { ok: true, url: (await res.json()).html_url };
}

async function ntfyPush(title, text, prio) {
  if (!NTFY) return { ok: false, why: "kein NTFY_TOPIC" };
  const res = await fetch(`https://ntfy.sh/${NTFY}`, {
    method: "POST",
    headers: { Title: encodeURIComponent(title), Priority: prio, Tags: "vertical_traffic_light" },
    body: text.split("\n\n")[0].slice(0, 400),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok ? { ok: true } : { ok: false, why: `HTTP ${res.status}` };
}

// Labels müssen existieren, sonst lehnt GitHub das Issue ab.
async function ensureLabels() {
  if (!TOKEN) return;
  const want = [
    { name: "signal", color: "2DD4A7", description: "Handlungsbedarf laut Ampel" },
    { name: "technik", color: "F0B429", description: "Pipeline oder Datenquellen" },
  ];
  for (const l of want) {
    try {
      await fetch(`https://api.github.com/repos/${REPO}/labels`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify(l),
        signal: AbortSignal.timeout(15_000),
      }); // 422 bedeutet: gibt es schon. Das ist in Ordnung.
    } catch { /* nicht kritisch */ }
  }
}

// ---------------------------------------------------------------- Ablauf

const store = await readJSON("data/events.json", { events: [] });
const latest = await readJSON("data/latest.json", null);
const events = store.events || [];
const week = latest?.week_id ?? null;
const price = nf(latest?.price?.close);

// Zusätzliche Ereignisse, die nicht aus der Wiedergabe stammen
const extra = [];
if (stale(week, { now: NOW })) {
  const id = `${new Date(NOW).toISOString().slice(0, 10)}:PIPELINE_STALE`;
  if (!events.some((e) => e.id === id))
    extra.push({ id, week_id: week ?? new Date(NOW).toISOString().slice(0, 10), type: "PIPELINE_STALE",
      text: `Seit ${week ? "dem Wochenschluss " + week : "unbekannt"} kam keine neue Auswertung. Im Actions-Tab des Repos nachsehen.`, notified_at: null });
}
const yr = yearlyReview(events, { now: NOW });
if (yr) extra.push(yr);
if (TEST) extra.push({ id: `${new Date(NOW).toISOString().slice(0, 16)}:TEST`, week_id: week ?? "2026-01-04",
  type: "ALERT", text: "Testmeldung. Wenn du das liest, funktionieren Benachrichtigungen.", notified_at: null });

const all = [...events, ...extra];
// PIPELINE_STALE und Testmeldungen dürfen nicht am Alter scheitern
const forceFresh = new Set(extra.map((e) => e.id));
const { send, backfill, skipped } = selectPending(
  all.map((e) => (forceFresh.has(e.id) ? { ...e, week_id: new Date(NOW).toISOString().slice(0, 10) } : e)),
  { now: NOW });

console.log(`Ereignisse gesamt ${all.length} · offen ${send.length + backfill.length + skipped} · zu senden ${send.length}` +
  (backfill.length ? ` · stumm abgehakt ${backfill.length}` : "") + (skipped ? ` · zurückgestellt ${skipped}` : ""));

if (DRY) {
  for (const e of send) {
    const k = KIND[e.type] || { label: "signal", prio: "default", title: () => e.text };
    console.log(`\n--- [${k.label}] ${k.title(e)}\n${body(e, { site: SITE, week, price })}`);
  }
  process.exit(0);
}

if (send.length) await ensureLabels();

const stamp = new Date(NOW).toISOString();
const done = new Map();
for (const e of send) {
  const k = KIND[e.type] || { label: "signal", prio: "default", title: () => e.text };
  const title = `${k.title(e)} · ${e.week_id}`;
  const text = body(e, { site: SITE, week, price });
  const [gh, nt] = await Promise.all([ghIssue(title, text, k.label), ntfyPush(title, text, k.prio)]);
  if (gh.ok || nt.ok) {
    done.set(e.id, stamp);
    console.log(`✓ ${e.id}${gh.ok ? " · Issue " + gh.url : ""}${nt.ok ? " · ntfy" : ""}`);
  } else {
    console.log(`✗ ${e.id} · Issue: ${gh.why} · ntfy: ${nt.why}`);
  }
}
for (const e of backfill) done.set(e.id, "backfill");

// Zurückschreiben. Zusätzliche Ereignisse werden aufgenommen, damit sie nicht wiederkehren.
const merged = [...events, ...extra.filter((e) => done.has(e.id))]
  .map((e) => (done.has(e.id) ? { ...e, notified_at: done.get(e.id) } : e));
await writeJSON("data/events.json", { ...store, events: merged, generated_at: stamp }, { pretty: true });

const failed = send.length - [...done.keys()].filter((id) => send.some((e) => e.id === id)).length;
console.log(failed ? `\n${failed} Meldung(en) konnten nicht zugestellt werden.` : "\nFertig.");
