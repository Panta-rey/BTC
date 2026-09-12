// Reine Zeitreihen-Funktionen. Arrays sind dicht (ein Eintrag pro Tag oder Woche), null = fehlt.
// Keine Netzwerkzugriffe, keine Seiteneffekte: gleiche Eingabe, gleiche Ausgabe.

// Gleitender Durchschnitt über n Einträge. minCount: so viele Werte müssen im Fenster vorhanden sein.
export function sma(arr, n, minCount = n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v != null) { sum += v; cnt++; }
    if (i >= n) { const o = arr[i - n]; if (o != null) { sum -= o; cnt--; } }
    if (i >= n - 1 && cnt >= minCount) out[i] = sum / cnt;
  }
  return out;
}

// Exponentieller Durchschnitt, gestartet mit dem SMA der ersten n Werte.
// Fehlt ein Wert nach dem Start, wird der letzte EMA-Wert weitergeführt.
export function ema(arr, n) {
  const out = new Array(arr.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null, seedSum = 0, seedCnt = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (prev == null) {
      if (v == null) continue;
      seedSum += v; seedCnt++;
      if (seedCnt === n) { prev = seedSum / n; out[i] = prev; }
      continue;
    }
    if (v != null) prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Standardabweichung aller bisherigen Werte (Population), ohne Blick in die Zukunft.
export function expandingStd(arr, minCount = 2) {
  const out = new Array(arr.length).fill(null);
  let n = 0, mean = 0, m2 = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v != null) { n++; const d = v - mean; mean += d / n; m2 += d * (v - mean); }
    if (n >= minCount) out[i] = Math.sqrt(m2 / n);
  }
  return out;
}

// Füllt Lücken bis maxGap Einträge mit dem letzten bekannten Wert.
export function ffill(arr, maxGap) {
  const out = arr.slice();
  let last = null, gap = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) { last = out[i]; gap = 0; continue; }
    gap++;
    if (last != null && gap <= maxGap) out[i] = last;
  }
  return out;
}

// Letzter vorhandener Wert am Index i oder bis zu maxBack Einträge davor.
export function valueAtOrBefore(arr, i, maxBack) {
  for (let j = i; j >= 0 && j >= i - maxBack; j--) if (arr[j] != null) return { value: arr[j], index: j };
  return { value: null, index: null };
}

// Perzentilrang von v innerhalb der Werte (in %, Anteil der Werte <= v). Für Meilenstein M2.
export function percentileRank(values, v) {
  const xs = values.filter((x) => x != null);
  if (!xs.length || v == null) return null;
  let c = 0;
  for (const x of xs) if (x <= v) c++;
  return (c / xs.length) * 100;
}

export const ratio = (a, b) => (a != null && b != null && b !== 0 ? a / b : null);
export const round = (v, d = 4) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
