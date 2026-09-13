// Reine Auswahllogik für Benachrichtigungen (SPEC 9). Kein Netzwerk, damit testbar.

export const DAY = 86_400_000;

// Wie ein Ereignis behandelt wird.
export const KIND = {
  PHASE_CHANGE: { label: "signal", prio: "high",    title: (e) => `Phasenwechsel: ${e.text}` },
  TRANCHE_DUE:  { label: "signal", prio: "urgent",  title: (e) => e.text },
  TREND_BREAK:  { label: "signal", prio: "urgent",  title: (e) => "Trendbruch bestätigt" },
  RESERVE:      { label: "signal", prio: "default", title: (e) => "Reserve einsetzbar" },
  COUNTER:      { label: "signal", prio: "low",     title: (e) => "Vorstufe erreicht" },
  ALERT:        { label: "signal", prio: "low",     title: (e) => "Hinweis des inaktiven Motors" },
  DATA_GAP:     { label: "technik", prio: "default", title: () => "Daten unvollständig" },
  PIPELINE_STALE:{ label: "technik", prio: "high",   title: () => "Pipeline liefert nicht" },
  YEARLY_REVIEW:{ label: "technik", prio: "low",     title: () => "Jahres-Review" },
  MONTHLY_MANUAL:{ label: "technik", prio: "low",    title: () => "Monatliche Handeingabe fällig" },
};

/**
 * Entscheidet, welche Ereignisse verschickt werden.
 * Drei Regeln:
 *  1. Bereits gemeldete (notified_at gesetzt) werden übersprungen.
 *  2. Alte Ereignisse werden stumm abgehakt. Sonst würde der erste Lauf
 *     die gesamte Historie seit 2014 als Meldungen ausspucken.
 *  3. Pro Lauf höchstens `cap` Meldungen, älteste zuerst.
 */
export function selectPending(events, { now = Date.now(), maxAgeDays = 21, cap = 5 } = {}) {
  const send = [], backfill = [];
  for (const e of events) {
    if (e.notified_at) continue;
    const age = (now - Date.parse(e.week_id + "T00:00:00Z")) / DAY;
    (age > maxAgeDays ? backfill : send).push(e);
  }
  send.sort((a, b) => (a.week_id < b.week_id ? -1 : a.week_id > b.week_id ? 1 : 0));
  return { send: send.slice(0, cap), backfill, skipped: Math.max(0, send.length - cap) };
}

// Meldungstext. Kurz halten, die Einzelheiten stehen auf der Seite.
export function body(e, { site, week, price }) {
  const L = [];
  L.push(e.text, "");
  if (e.tranche) L.push(`Tranche: **${e.tranche}**`);
  if (e.tranches?.length) L.push(`Tranchen: **${e.tranches.join(", ")}**`);
  if (e.from && e.to) L.push(`Phase ${e.from} → ${e.to}`);
  L.push(`Wochenschluss ${e.week_id}${price ? ` · ${price} USD` : ""}`);
  L.push("", `Beträge und Begründung auf der Seite: ${site}`, "",
    `<sub>Automatisch erzeugt · Ereignis \`${e.id}\` · Konfiguration ${e.config_version ?? "–"}${week && week !== e.week_id ? ` · Lauf für Woche ${week}` : ""}</sub>`);
  return L.join("\n");
}

// Ist die letzte Wochenauswertung zu alt? (SPEC 9.3)
export function stale(weekId, { now = Date.now(), days = 9 } = {}) {
  if (!weekId) return true;
  return (now - Date.parse(weekId + "T00:00:00Z")) / DAY > days;
}

// Monatliche Erinnerung an die Handeingabe, in den ersten Tagen des Monats.
// Erinnert nur an die Kennzahlen, die sofort wirken und den Kauf-Motor betreffen
// (HANDOFF §4a). Liegt für den laufenden Monat schon eine Lesung vor, entfällt sie.
export function monthlyManual(events, { now = Date.now(), readings = {}, keys = MONTHLY_KEYS, tage = 5 } = {}) {
  const d = new Date(now);
  if (d.getUTCDate() > tage) return null;
  const monat = new Date(now).toISOString().slice(0, 7);
  const id = `${monat}:MONTHLY_MANUAL`;
  if (events.some((e) => e.id === id)) return null;

  // Was fehlt diesen Monat noch?
  const offen = keys.filter((k) => {
    const letzte = readings[k];
    return !letzte || letzte.slice(0, 7) < monat;
  });
  if (!offen.length) return null;

  const namen = offen.map((k) => MANUAL_LABEL[k] ?? k);
  return {
    id, week_id: new Date(now).toISOString().slice(0, 10), type: "MONTHLY_MANUAL",
    text: `Monatliche Handeingabe: ${namen.join(" und ")} ablesen und eintragen. `
      + "In den Einstellungen der Seite je Kennzahl auf „↗ Chart öffnen“, Wert eintragen, "
      + "„✓ Speichern“ tippen und das vorbereitete Issue mit „Create“ abschicken. "
      + "Das hebt die Abdeckung des Kauf-Motors von 80 auf 100 Prozent.",
    offen, notified_at: null,
  };
}

// Reserve Risk fehlt hier bewusst: Seine absoluten Ankerpunkte sind veraltet und
// melden im laufenden Zyklus in 100 % der Wochen "in Zone" (reports/anker-check.md).
// Siehe HANDOFF §4a. Erst nach neu geschnittenen Ankern wieder aufnehmen.
export const MONTHLY_KEYS = ["supply_in_profit", "sth_realized_price"];

export const MANUAL_LABEL = {
  reserve_risk: "Reserve Risk",
  supply_in_profit: "Angebot im Gewinn",
  sth_realized_price: "STH-Realized-Price",
  rhodl: "RHODL-Ratio",
  lth_net_position_change: "LTH-Positionsänderung 30 T",
};

// Jahres-Review: einmal pro Jahr in der ersten Januarwoche.
export function yearlyReview(events, { now = Date.now() } = {}) {
  const d = new Date(now);
  if (d.getUTCMonth() !== 0 || d.getUTCDate() > 7) return null;
  const year = d.getUTCFullYear();
  const id = `${year}:YEARLY_REVIEW`;
  if (events.some((e) => e.id === id)) return null;
  return {
    id, week_id: new Date(now).toISOString().slice(0, 10), type: "YEARLY_REVIEW",
    text: "Jahres-Review: Backup exportiert? Kernposition noch passend? Quellen alle grün? Nach einem abgeschlossenen Zyklus zusätzlich den Backtest neu bewerten.",
    notified_at: null,
  };
}
