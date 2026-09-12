// Wandelt die kompakte weekly.json (Spalten + Zeilen) in Objekte um und ergänzt abgeleitete Felder.

const PENDING = ["supply_loss", "reserve_risk", "rhodl", "lth_dist"];

// manual: { supply_loss: {woche: wert}, reserve_risk: {...}, rhodl: {...}, lth_dist: {...}, sth_rp: {...} }
export function toRows(weekly, { manual = {}, staleIds = {} } = {}) {
  const cols = weekly.columns;
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  const rows = weekly.rows.map((r) => {
    const o = {};
    for (const c of cols) o[c] = r[idx[c]];
    // Quelle ausstehend (SPEC 3.4). Manuelle Werte springen ein, wo vorhanden.
    for (const p of PENDING) o[p] = manual[p]?.[o.w] ?? null;
    o.sth_rp = manual.sth_rp?.[o.w] ?? null;
    o._stale = staleIds[o.w] ?? [];
    return o;
  });

  // Rückgang vom 52-Wochen-Hoch (für die Nachkauf-Chance, SPEC 6.5)
  for (let i = 0; i < rows.length; i++) {
    let hi = -Infinity;
    for (let j = Math.max(0, i - 51); j <= i; j++) if (rows[j].close != null && rows[j].close > hi) hi = rows[j].close;
    rows[i].dd_52w = hi > 0 && rows[i].close != null ? (rows[i].close / hi - 1) * 100 : null;
  }
  return rows;
}
