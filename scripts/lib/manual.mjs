// Prüfen und Zusammenführen manuell eingereichter Kennzahlen. Rein funktional, testbar.
// Sicherheit: Nur bekannte Schlüssel, nur plausible Werte, keine Datumsangaben aus der Zukunft.

export const KEYS = {
  sth_realized_price:      { label: "STH-Realized-Price", unit: "USD", min: 1,    max: 10_000_000 },
  supply_in_profit:        { label: "Angebot im Gewinn",  unit: "%",   min: 0,    max: 100 },
  // Reserve Risk wird absolut bewertet (SPEC 4.3). Die Skala hängt am Anbieter:
  // BGeometrics und Glassnode liegen bei rund 0.001 bis 0.05, andere rechnen
  // um Grössenordnungen kleiner. Werte ausserhalb werden deshalb abgewiesen.
  reserve_risk:            { label: "Reserve Risk",       unit: "",    min: 0.0001, max: 0.5,
                             hint: "Erwartet wird die Skala von BGeometrics oder Glassnode, also etwa 0.001 bis 0.05. Liegt dein Wert um Grössenordnungen daneben, stammt er von einem Anbieter mit anderer Normierung." },
  rhodl:                   { label: "RHODL-Ratio",        unit: "",    min: 0,    max: 100_000_000 },
  lth_net_position_change: { label: "LTH-Positionsänderung 30 T", unit: "BTC", min: -5_000_000, max: 5_000_000 },
};

const MAX_READINGS = 400;   // rund acht Jahre wöchentlich
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Liest den JSON-Block aus einem Issue-Text.
 * Erwartet einen Codeblock ```json … ``` oder reines JSON.
 */
export function parseSubmission(body, { today } = {}) {
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : body).trim();
  if (!raw) return { ok: false, error: "Kein JSON-Block gefunden." };

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { return { ok: false, error: `JSON nicht lesbar: ${e.message}` }; }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { ok: false, error: "Erwartet wird ein JSON-Objekt." };

  const values = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;              // Kommentarfelder überspringen
    const meta = KEYS[k];
    if (!meta) return { ok: false, error: `Unbekannter Schlüssel: ${k}` };
    if (!Array.isArray(v)) return { ok: false, error: `${k}: erwartet wird eine Liste.` };
    if (v.length > MAX_READINGS) return { ok: false, error: `${k}: zu viele Lesungen (${v.length}).` };

    const list = [];
    for (const r of v) {
      if (!r || typeof r !== "object") return { ok: false, error: `${k}: Eintrag ist kein Objekt.` };
      const d = String(r.d ?? "");
      const val = Number(r.v);
      if (!ISO.test(d) || Number.isNaN(Date.parse(d + "T00:00:00Z")))
        return { ok: false, error: `${k}: ungültiges Datum "${r.d}".` };
      if (today && d > today) return { ok: false, error: `${k}: Datum ${d} liegt in der Zukunft.` };
      if (!Number.isFinite(val)) return { ok: false, error: `${k}: Wert bei ${d} ist keine Zahl.` };
      if (val < meta.min || val > meta.max)
        return { ok: false, error: `${k}: Wert ${val} bei ${d} liegt ausserhalb von ${meta.min} bis ${meta.max}.${meta.hint ? " " + meta.hint : ""}` };
      list.push({ d, v: val });
    }
    values[k] = list.sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  if (!Object.keys(values).length) return { ok: false, error: "Keine bekannten Kennzahlen im Block." };
  return { ok: true, values };
}

// Führt neue Lesungen in die bestehende Datei ein. Gleiches Datum wird ersetzt,
// alles andere bleibt erhalten. Reihenfolge und Kommentarfelder bleiben bestehen.
export function mergeReadings(current, incoming) {
  const next = { ...current };
  let added = 0, replaced = 0;

  for (const [k, list] of Object.entries(incoming)) {
    const old = Array.isArray(current?.[k]) ? current[k]
      : (current?.[k]?.as_of ? [{ d: current[k].as_of, v: Number(current[k].value) }] : []);
    const map = new Map(old.filter((r) => r?.d != null).map((r) => [r.d, Number(r.v)]));
    for (const r of list) {
      if (map.has(r.d)) { if (map.get(r.d) !== r.v) replaced++; else continue; }
      else added++;
      map.set(r.d, r.v);
    }
    next[k] = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-MAX_READINGS).map(([d, v]) => ({ d, v }));
  }
  // Fehlende Schlüssel als leere Listen anlegen, damit die Datei vollständig bleibt
  for (const k of Object.keys(KEYS)) if (!Array.isArray(next[k])) next[k] = next[k] ?? [];
  return { next, added, replaced };
}
