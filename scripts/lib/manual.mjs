// Prüfen, Zusammenführen und Auswerten manuell eingereichter Kennzahlen. Rein funktional, testbar.
// Sicherheit: Nur bekannte Schlüssel, nur plausible Werte, keine Datumsangaben aus der Zukunft.

export const KEYS = {
  sth_realized_price:      { label: "STH-Realized-Price", unit: "USD", min: 1,    max: 10_000_000 },
  // Seit 2012 lag der Wert nie unter 35 %. Alles unter 5 ist fast sicher ein Anteil (0.62)
  // statt eines Prozentwerts (62) oder die falsche Linie.
  supply_in_profit:        { label: "Angebot im Gewinn",  unit: "%",   min: 5,    max: 100,
                             hint: "Erwartet wird der Prozentwert der Hauptlinie, zum Beispiel 62.2, nicht der Anteil 0.62." },
  // Reserve Risk wird absolut bewertet (SPEC 4.3). Die Skala hängt am Anbieter:
  // BGeometrics und Glassnode liegen bei rund 0.001 bis 0.05, andere rechnen
  // um Grössenordnungen kleiner. Werte ausserhalb werden deshalb abgewiesen.
  reserve_risk:            { label: "Reserve Risk",       unit: "",    min: 0.0001, max: 0.5,
                             hint: "Erwartet wird die Skala von BGeometrics oder Glassnode, also etwa 0.001 bis 0.05. Liegt dein Wert um Grössenordnungen daneben, stammt er von einem Anbieter mit anderer Normierung." },
  rhodl:                   { label: "RHODL-Ratio",        unit: "",    min: 0,    max: 100_000_000 },
  lth_net_position_change: { label: "LTH-Positionsänderung 30 T", unit: "BTC", min: -5_000_000, max: 5_000_000 },
};

// Zurückgestellte Kennzahlen (HANDOFF §4a und §13). Sie werden weder angenommen noch
// ausgewertet, bis sie nach dem Zyklusende neu bewertet sind. Das ist keine Änderung an
// config/engine.json: Die Konfiguration bleibt, wie sie im Backtest geprüft wurde, und genau
// deshalb dürfen diese drei Reihen den Live-Lauf nicht erreichen. Zweimal sind sie trotz
// der Regel im Handoff eingetragen worden (18.09. und Oktober/November 2026); seither
// steht die Regel hier im Code statt nur im Text.
export const DEFERRED = ["reserve_risk", "rhodl", "lth_net_position_change"];

// Der STH-Einstand lag seit 2015 zwischen dem 0,42- und dem 1,94-Fachen des Kurses.
// Ausserhalb des 0,3- bis 3-Fachen ist es ein Tippfehler (am 01.11.2026 stand 758'549
// statt 75'817 in der Datei) oder die falsche Linie.
export const STH_PRICE_RATIO = { min: 0.3, max: 3 };

const MAX_READINGS = 400;   // rund acht Jahre wöchentlich
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Liest den JSON-Block aus einem Issue-Text.
 * Erwartet einen Codeblock ```json … ``` oder reines JSON.
 */
export function parseSubmission(body, { today, priceAt } = {}) {
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fence ? fence[1] : body).trim();
  if (!raw) return { ok: false, error: "Kein JSON-Block gefunden." };

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { return { ok: false, error: `JSON nicht lesbar: ${e.message}` }; }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { ok: false, error: "Erwartet wird ein JSON-Objekt." };

  const values = {};
  const ignored = [];
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith("_")) continue;              // Kommentarfelder überspringen
    const meta = KEYS[k];
    if (!meta) return { ok: false, error: `Unbekannter Schlüssel: ${k}` };
    if (!Array.isArray(v)) return { ok: false, error: `${k}: erwartet wird eine Liste.` };
    // Zurückgestellte Kennzahlen werden verworfen, nicht abgewiesen: Ein alter Entwurf im
    // Browser soll die beiden gültigen Werte nicht blockieren.
    if (DEFERRED.includes(k)) { if (v.length) ignored.push(meta.label); continue; }
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
      if (r.v == null || r.v === "" || typeof r.v === "boolean")
        return { ok: false, error: `${k}: Wert bei ${d} fehlt.` };
      if (val < meta.min || val > meta.max)
        return { ok: false, error: `${k}: Wert ${val} bei ${d} liegt ausserhalb von ${meta.min} bis ${meta.max}.${meta.hint ? " " + meta.hint : ""}` };
      if (k === "sth_realized_price" && priceAt) {
        const p = priceAt(d);
        if (Number.isFinite(p) && p > 0) {
          const f = val / p;
          if (f < STH_PRICE_RATIO.min || f > STH_PRICE_RATIO.max)
            return { ok: false, error: `${k}: Wert ${val} bei ${d} passt nicht zum Kurs von rund ${Math.round(p)} USD (Faktor ${f.toFixed(2)}). Erwartet wird das ${STH_PRICE_RATIO.min}- bis ${STH_PRICE_RATIO.max}-Fache des Kurses. Tippfehler oder falsche Linie? Abzulesen ist „STH Cost Basis“, nicht „Realised Price“.` };
        }
      }
      list.push({ d, v: val });
    }
    values[k] = list.sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  if (!Object.keys(values).length) {
    return { ok: false, error: ignored.length
      ? `Nur zurückgestellte Kennzahlen im Block (${ignored.join(", ")}). Sie werden derzeit nicht angenommen, siehe HANDOFF §4a.`
      : "Keine bekannten Kennzahlen im Block." };
  }
  return { ok: true, values, ignored };
}

// Wochenschluss zum Datum einer Lesung: der letzte Schluss am oder vor dem Tag, sonst der
// erste danach. Eingabe ist data/weekly.json (Spalten w und close).
export function priceLookup(weekly) {
  const iw = weekly?.columns?.indexOf("w") ?? -1, ic = weekly?.columns?.indexOf("close") ?? -1;
  if (iw < 0 || ic < 0) return () => null;
  const rows = weekly.rows.filter((r) => Number.isFinite(r[ic])).map((r) => [r[iw], r[ic]]);
  return (d) => {
    let best = null;
    for (const [w, c] of rows) { if (w <= d) best = c; else { if (best == null) best = c; break; } }
    return best;
  };
}

// Die Lesungen einer Kennzahl, wie die Auswertung sie sieht: sortierte [datum, wert]-Paare.
// Zurückgestellte Kennzahlen liefern immer eine leere Liste, auch wenn jemand sie von Hand
// in die Datei schreibt. Leere Werte zählen nicht als 0.
export function readingsOf(manual, key) {
  if (DEFERRED.includes(key)) return [];
  const raw = manual?.[key];
  if (!raw) return [];
  const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN);
  const list = Array.isArray(raw) ? raw.map((r) => [r?.d, num(r?.v)]) : [[raw.as_of, num(raw.value)]];
  return list.filter(([d, v]) => d && Number.isFinite(v)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Führt neue Lesungen in die bestehende Datei ein. Gleiches Datum wird ersetzt,
// alles andere bleibt erhalten. Reihenfolge und Kommentarfelder bleiben bestehen.
export function mergeReadings(current, incoming) {
  const next = { ...current };
  let added = 0, replaced = 0;

  for (const [k, list] of Object.entries(incoming)) {
    if (DEFERRED.includes(k)) continue;
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

// Eine Lesung gilt für die Woche, in die sie fällt, und bis zu 30 Tage danach.
// So wirkt ein monatlich eingetragener Wert, ohne dass er ewig weiterläuft.
export const MANUAL_MAX_AGE = 30;
const DAY_MS = 86_400_000;

// Handwerte je Wochenschluss, in der Form, die engine/rows.mjs erwartet. Das ist der
// einzige Weg, auf dem Handwerte in die Wiedergabe gelangen: Wochenauswertung, Backtest
// und Indikator-Prüfung benutzen dieselbe Funktion und sehen damit dieselbe Geschichte.
export function manualByWeek(manual, weekIds, maxAge = MANUAL_MAX_AGE) {
  const by = (list, transform = (v) => v) => {
    const out = {};
    if (!list.length) return out;
    for (const w of weekIds) {
      let best = null;
      for (const [d, v] of list) if (d <= w && Math.round((Date.parse(w) - Date.parse(d)) / DAY_MS) <= maxAge) best = v;
      if (best != null) out[w] = transform(best);
    }
    return out;
  };
  return {
    sth_rp:       by(readingsOf(manual, "sth_realized_price")),
    supply_loss:  by(readingsOf(manual, "supply_in_profit"), (v) => 100 - v),
    reserve_risk: by(readingsOf(manual, "reserve_risk")),
    rhodl:        by(readingsOf(manual, "rhodl")),
    lth_dist:     by(readingsOf(manual, "lth_net_position_change"), (v) => -v),
  };
}
