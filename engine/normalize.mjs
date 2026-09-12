// Normierung einzelner Indikatorwerte auf 0–100 (SPEC 4.2).
// Rein funktional: keine Netzwerkzugriffe, kein Blick in die Zukunft.

// Stückweise lineare Interpolation über Ankerpunkte [[wert, score], ...].
// Die Punkte dürfen in beliebiger Reihenfolge stehen; ausserhalb wird auf den Randwert begrenzt.
export function anchorScore(anchors, v) {
  if (v == null || !Number.isFinite(v) || !anchors?.length) return null;
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  if (v <= pts[0][0]) return pts[0][1];
  if (v >= pts.at(-1)[0]) return pts.at(-1)[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (v <= x1) return x1 === x0 ? y1 : y0 + ((v - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts.at(-1)[1];
}

// Perzentilrang von v im Fenster (Anteil der Werte <= v, in %).
// Das Fenster enthält ausschliesslich Vergangenheit und den aktuellen Wert.
export function percentile(window, v) {
  if (v == null || !Number.isFinite(v)) return null;
  const xs = window.filter((x) => x != null && Number.isFinite(x));
  if (!xs.length) return null;
  let c = 0;
  for (const x of xs) if (x <= v) c++;
  return (c / xs.length) * 100;
}

// Ein Indikator kann absolut, relativ (Perzentil) oder hybrid bewertet werden.
// Hybrid nimmt das Maximum beider Wege: so fängt er sinkende Zyklusextreme ab,
// ohne die bewährten absoluten Marken aufzugeben.
export function score(anchorSet, value, pct) {
  if (!anchorSet) return null;
  const a = anchorSet.abs ? anchorScore(anchorSet.abs, value) : null;
  const p = anchorSet.pct ? anchorScore(anchorSet.pct, pct) : null;
  if (a == null) return p;
  if (p == null) return a;
  return Math.max(a, p);
}

export const clamp = (v, lo = 0, hi = 100) => (v == null ? null : Math.min(hi, Math.max(lo, v)));
