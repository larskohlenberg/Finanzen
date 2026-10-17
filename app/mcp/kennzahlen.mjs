// app/mcp/kennzahlen.mjs
// Reine Funktion hinter dem MCP-Tool `kennzahlen`: die Kennzahlen der
// Uebersicht als kompakter Text. Gerechnet wird ausschliesslich mit denselben
// Funktionen wie die Uebersicht (uebersicht-rechnung.mjs, vermoegen.mjs,
// next-action.mjs, fristen.mjs, absicherung.mjs); hier wird nur formatiert.
// Betraege als Decimal-String.
import { absicherung } from "../absicherung.mjs";
import { anstehendeFristen } from "../fristen.mjs";
import { buildNextAgentAction } from "../next-action.mjs";
import { centsToDecimal } from "../tools/lib/text.mjs";
import { checkItems, checkVorschau, kontenGruppen, kontoZeile, saldoGeladenerKonten, sortierteKonten } from "../uebersicht-rechnung.mjs";
import { computeNettovermoegen } from "../vermoegen.mjs";

const eur = (cents) => `${centsToDecimal(cents)} EUR`;
const art = (item) => String(item.title_key ?? "").split(".").pop();

function artenZaehlen(items) {
  const anzahl = new Map();
  for (const item of items) anzahl.set(art(item), (anzahl.get(art(item)) ?? 0) + 1);
  return [...anzahl].map(([a, n]) => `${a} ${n}`).join(", ");
}

export function fristZeile(termin) {
  const bezug = termin.bezug ? ` (${termin.bezug.typ} ${termin.bezug.id})` : "";
  const herkunft = termin.frist_id ? ` [${termin.frist_id}]` : " [abgeleitet]";
  const lage = termin.ueberfaellig ? ", ueberfaellig" : termin.bald ? ", bald" : "";
  return `- ${termin.datum} ${termin.art}: ${termin.bezeichnung}${bezug}${herkunft}${lage}`;
}

export function istKalenderdatum(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [j, m, t] = text.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

// Absicherung je versicherter Person: Summen je Fall, darunter die Posten.
function absicherungZeilen(data, stichtag) {
  const personen = absicherung(data, stichtag);
  if (!personen.length) return ["Absicherung: keine Person mit laufendem Vorsorgevertrag"];
  const fall = (summen) => summen.filter(([cents]) => cents).map(([cents, einheit]) => `${eur(cents)} ${einheit}`).join(" + ") || "nicht erfasst";
  return [
    "Absicherung je versicherter Person (Leistung bei BU bzw. Tod; nur erfasste Werte, ohne Bedarfsrechnung; Monatswerte brutto):",
    ...personen.flatMap((p) => [
      `- ${p.person_id} ${p.name}: BU ${fall([[p.bu.monatlich_cents, "je Monat"]])}; Tod ${fall([[p.tod.einmalig_cents, "einmalig"], [p.tod.monatlich_cents, "je Monat"]])}`,
      ...[["BU", p.bu.posten], ["Tod", p.tod.posten]].flatMap(([name, posten]) =>
        posten.map((x) => `  * ${name} ${x.vorsorge_id} ${x.name}: ${x.feld} ${eur(x.wert_cents)}, Stand ${x.standdatum}`)),
    ]),
  ];
}

// data: Bestand wie im Browser (loadFinanceData + validation, checks, importfehler).
export function kennzahlenText(data, stichtag) {
  const netto = computeNettovermoegen(data, stichtag);
  const items = checkItems(data, stichtag);
  const vorschau = checkVorschau(items);
  const aktion = buildNextAgentAction(data, { today: stichtag });
  const q = netto.qualitaet;
  const gruppen = kontenGruppen(data, stichtag);
  const fristen = anstehendeFristen(data, stichtag);
  const abdeckung = (g) => `${g.belegt} von ${g.gesamt} belegt${g.aeltester ? `, aeltester Stand ${g.aeltester}` : ""}`;

  const zeilen = [
    `Kennzahlen der Uebersicht, Stichtag ${stichtag}. Betraege in EUR als Decimal-String.`,
    "",
    `Nettovermoegen: ${eur(netto.netto_cents)} (Aktiva ${eur(netto.aktiva_cents)}, Passiva ${eur(netto.passiva_cents)})`,
    `  Qualitaet: belegt ${q.belegt}, geschaetzt ${q.geschaetzt}, fehlend ${q.fehlend}, gesamt ${q.gesamt ?? "offen"}`,
    "  Positionen (Wert zum Stichtag; Konten = belegter Anker + Buchungen danach, Stand = letzte eingerechnete Buchung):",
    ...netto.positionen.map((p) => `  * ${p.klasse} ${p.id} ${p.name}: ${p.fehlt ? `fehlt (${p.basis})` : `${eur(p.wert_cents)}, Stand ${p.standdatum ?? "-"}, ${p.qualitaet ?? "offen"}`}`),
    "",
    `Verfuegbares Geld: ${eur(gruppen.konten.summe_cents)} (= Summe Konten der Tabelle, ${abdeckung(gruppen.konten)})`,
    `Summe Depots: ${eur(gruppen.depots.summe_cents)} (${abdeckung(gruppen.depots)})`,
    "",
    `Summe geladener Bewegungen (Konten): ${eur(saldoGeladenerKonten(data))}`,
    "  Nur geladene Buchungen liquiditaetsrelevanter Konten ohne Depots, kein Anfangssaldo, ohne Stichtagsbezug.",
    "",
    "Konten (Tabelle der Uebersicht; Wert = Depotwert bzw. belegter Anker + Buchungen danach, wie im Nettovermoegen):",
    ...sortierteKonten(data).map((k) => {
      const z = kontoZeile(data, k, stichtag);
      const wert = z.wert_cents === null ? `kein Wert (${z.basis})` : `${eur(z.wert_cents)}, ${z.qualitaet ?? "offen"} zum ${z.belegdatum}${z.veraltet ? ", veraltet" : ""}`;
      return `- ${k.konto_id} ${k.name} (${k.kontotyp}${k.status === "geschlossen" ? ", geschlossen" : ""}): ${wert}`;
    }),
    "",
    aktion.type === "none" ? "Naechste Aktion: keine" : `Naechste Aktion: ${aktion.label} (${aktion.count})`,
    `Checks: ${items.length}${items.length ? ` (${artenZaehlen(items)})` : ""}${items.length > vorschau.length ? `, Vorschau der ersten ${vorschau.length}` : ""}`,
    ...vorschau.map((c) => `- ${art(c)}: ${c.detail ?? ""}`),
    "",
    `Fristen (12 Monate ab Stichtag, dazu ueberfaellige; bald = innerhalb 60 Tagen): ${fristen.length}`,
    ...fristen.map(fristZeile),
    "",
    ...absicherungZeilen(data, stichtag),
  ];
  return zeilen.join("\n");
}
