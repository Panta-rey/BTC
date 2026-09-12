// Lesen und Schreiben der JSON-Dateien im Repo.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJSON(path, fallback = null) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return fallback; }
}

// pretty = true für kleine, von Menschen gelesene Dateien; grosse Reihen kompakt.
export async function writeJSON(path, data, { pretty = false } = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n");
}

// Führt [datum, wert]-Paare zusammen. Neue Werte überschreiben alte am selben Datum.
export function mergeValues(oldValues = [], newValues = []) {
  const m = new Map(oldValues || []);
  for (const [d, v] of newValues) if (v != null && Number.isFinite(v)) m.set(d, v);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
