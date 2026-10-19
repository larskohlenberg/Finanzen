// app/mcp/kennzahlen.mjs
// Reine Funktion hinter dem MCP-Tool `kennzahlen`: die Kennzahlen der
// Uebersicht als kompakter Text. Gerechnet wird ausschliesslich mit denselben
// Funktionen wie die Uebersicht (uebersicht-rechnung.mjs, vermoegen.mjs,
// next-action.mjs, fristen.mjs, absicherung.mjs); hier wird nur formatiert.
// Betraege als Decimal-String. Dazu planIstText hinter dem Tool `plan_ist`
// (Rechnung in plan-ist.mjs wie die Seite Plan & Ist).
import { importAbdeckung } from "../klassifikation.mjs";
import { absicherung } from "../absicherung.mjs";
import { bestandsMonate, perioden, planIst, zeitraumMonate } from "../plan-ist.mjs";
import { anstehendeFristen } from "../fristen.mjs";
import { buildNextAgentAction } from "../next-action.mjs";
import { centsToDecimal } from "../tools/lib/text.mjs";
import { checkItems, checkVorschau, kontenGruppen, kontoZeile, mittelVergleich, monatsMittel, saldoGeladenerKonten, sortierteKonten, vorjahresMittel } from "../uebersicht-rechnung.mjs";
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

// Umfang und Ausschluesse einer Kennzahl (klassifikation.mjs) als Textzeilen.
const KLASSE_TEXT = { transfer: "Umbuchungen", startzustand: "Startzustaende", investition: "Investitionen", sondereffekt: "Sondereffekte (Gutschriften)" };
export function umfangZeilen(abdeckung, ausschluesse) {
  const konten = abdeckung.konten.map((k) => `${k.konto_id} bis ${k.belegt_bis || "-"}`).join(", ");
  const aus = Object.entries(ausschluesse ?? {}).filter(([, x]) => x.anzahl).map(([k, x]) => `${KLASSE_TEXT[k] ?? k} ${x.anzahl} (${centsToDecimal(x.summe_cents)})`).join(", ");
  return [
    `  Umfang: verfuegbare Konten belegt (letzte Buchung oder Kontostand): ${konten || "keine"}; vollstaendig bis ${abdeckung.vollstaendig_bis || "-"}${abdeckung.begrenzt_durch ? `, begrenzt durch ${abdeckung.begrenzt_durch}` : ""}`,
    `  Nicht enthalten: ${aus || "nichts"}`,
  ];
}

const quote = (q) => (q === null ? "-" : `${Math.round(q * 1000) / 10} %`);
const abw = (ist, plan) => `${ist - plan >= 0 ? "+" : ""}${centsToDecimal(ist - plan)}`;

// Kacheln Einnahmen, Ausgaben, Sparquote der Uebersicht (Ø der letzten zwoelf
// vollen Monate) mit dem Plan aus den Regelzahlungen im selben Zeitraum.
function monatsZeilen(data, stichtag) {
  const abdeckung = importAbdeckung(data, stichtag);
  const mittel = monatsMittel(data, stichtag, { vollstaendigBis: abdeckung.vollstaendig_bis });
  if (!mittel.anzahl_monate) return ["Einnahmen, Ausgaben, Sparquote: noch kein voller Monat gebucht"];
  const r = planIst(data, mittel.monate);
  const m = (c) => Math.round(c / mittel.anzahl_monate);
  return [
    `Einnahmen, Ausgaben, Sparquote (Ø je Monat, ${mittel.anzahl_monate} volle Monate ${mittel.von} bis ${mittel.bis}; Ist wie die Kacheln, Plan aus den Regelzahlungen; Details im Tool plan_ist):`,
    ...umfangZeilen(abdeckung, mittel.ausschluesse),
    `- Einnahmen: Ist ${eur(mittel.einnahmen.mittel_cents)}, Plan ${eur(m(r.einnahmen.plan_cents))}, Abweichung ${abw(mittel.einnahmen.mittel_cents, m(r.einnahmen.plan_cents))}`,
    `- Ausgaben: Ist ${eur(mittel.ausgaben.mittel_cents)}, Plan ${eur(m(r.ausgaben.plan_cents))}, Abweichung ${abw(mittel.ausgaben.mittel_cents, m(r.ausgaben.plan_cents))}; davon Einzelposten ab 400 Euro ohne Regelzahlung ${eur(m(r.ausgaben.einzel_cents))}`,
    `- Sparquote: Ist ${quote(mittel.sparen.quote)} (${eur(mittel.sparen.ueberschuss_cents)} Ueberschuss), Plan ${quote(r.sparen.plan.quote)} (${eur(m(r.sparen.plan.ueberschuss_cents))})`,
    ...mittel.sparen.ziele.map((z) => `  * ${z.ziel}: Ist ${eur(z.mittel_cents)}${z.ziel === "liquide" ? "" : `, Plan ${eur(m(r.sparen.plan[`${z.ziel}_cents`]))}`}`),
    ...trendZeilen(mittelVergleich(mittel, vorjahresMittel(data, mittel)), mittel),
  ];
}

// Pfeile der Kacheln: letzte zwoelf Monate gegen die zwoelf davor; Kategorien
// nur, wenn sie sich spuerbar veraendert haben (ab 5 Prozent und 20 Euro).
function trendZeilen(v, mittel) {
  if (!v) return ["Trend: fuer den Vergleich fehlen noch zwoelf volle Vormonate"];
  const pz = (x) => (x.anteil === null ? "neu" : `${x.anteil >= 0 ? "+" : ""}${Math.round(x.anteil * 1000) / 10} %`);
  const zeile = (name, x) => `${name}: ${x.richtung}, ${eur(x.vorher_cents)} -> ${eur(x.aktuell_cents)} (${pz(x)})`;
  const name = (seite, id) => `${id} ${mittel[seite].kategorien.find((k) => k.kategorie_id === id)?.name ?? ""}`.trim();
  const kategorien = (seite) => Object.entries(v[seite].kategorien).filter(([, x]) => x.richtung !== "seitwaerts").map(([id, x]) => `  * ${zeile(name(seite, id), x)}`);
  return [
    "Trend (Ø letzte 12 Monate gegen die 12 davor; seitwaerts unter 5 % oder 20 Euro):",
    `- ${zeile("Einnahmen", v.einnahmen.summe)}`,
    ...kategorien("einnahmen"),
    `- ${zeile("Ausgaben", v.ausgaben.summe)}`,
    ...kategorien("ausgaben"),
    `- Sparquote: ${quote(v.sparquote.vorher_quote)} -> ${quote(v.sparquote.quote)} (${v.sparquote.aenderung_pp === null ? "-" : `${v.sparquote.aenderung_pp >= 0 ? "+" : ""}${v.sparquote.aenderung_pp} Prozentpunkte`})`,
  ];
}

// Plan & Ist fuer einen Zeitraum ("" bzw. "gesamt" = ganzer Bestand, "12m",
// "2026", "2026-Q2", "2026-05"), je Monat gemittelt oder als Summe, optional
// mit dem Verlauf je Jahr, Quartal oder Monat.
export function planIstText(data, stichtag, { zeitraum = "", darstellung = "je_monat", verlauf = "" } = {}) {
  const abdeckung = importAbdeckung(data, stichtag);
  const alle = bestandsMonate(data, stichtag, { vollstaendigBis: abdeckung.vollstaendig_bis });
  const auswahl = zeitraum === "gesamt" ? "" : zeitraum;
  const r = planIst(data, zeitraumMonate(alle, auswahl));
  if (!r.anzahl_monate) return `Plan & Ist: keine vollen Monate im Zeitraum ${zeitraum || "gesamt"} (Bestand ${alle[0] ?? "-"} bis ${alle.at(-1) ?? "-"}).`;
  const jeMonat = darstellung !== "summe";
  const w = (c) => (jeMonat ? Math.round(c / r.anzahl_monate) : c);
  const zeile = (k) => `- ${k.kategorie_id || "ohne"} ${k.name}${k.richtung ? ` (${k.richtung === "+" ? "Gutschriften" : "Belastungen"})` : ""}: Ist ${centsToDecimal(w(k.ist_cents))}, Plan ${centsToDecimal(w(k.plan_cents))}, Abweichung ${abw(w(k.ist_cents), w(k.plan_cents))}${k.einzel_cents ? `; Einzelposten ${centsToDecimal(w(k.einzel_cents))}, ohne sie ${abw(w(k.ist_cents - k.einzel_cents), w(k.plan_cents))}` : ""}`;
  const details = (k) => [
    ...k.regelzahlungen.map((z) => `  * ${z.regelzahlung_id} ${z.bezeichnung}: Plan ${centsToDecimal(w(z.plan_cents))}${z.konto_id ? `, gebucht ${centsToDecimal(w(z.gebucht_cents))} (${z.gebucht_anzahl} von ${z.termine} Terminen)` : " (Konsumplan)"}`),
    ...k.einzel_buchungen.slice(0, 5).map((b) => `  * Einzelposten ${b.datum} ${centsToDecimal(b.betrag_cents)} ${b.gegenpartei} [${b.transaktion_id}]`),
    ...(k.einzel_buchungen.length > 5 ? [`  * ... ${k.einzel_buchungen.length - 5} weitere Einzelposten`] : []),
  ];
  const { ist, plan } = r.sparen;
  const zeilen = [
    `Plan & Ist ${zeitraum || "gesamt"}: ${r.von} bis ${r.bis}, ${r.anzahl_monate} volle Monate. Betraege in EUR ${jeMonat ? "als Ø je Monat" : "als Summe"}.`,
    ...umfangZeilen(abdeckung, r.ausschluesse),
    "Ist: Buchungen ohne Umbuchungen, Startzustaende und Investitionen, Steuererstattungen als Sondereffekt daneben. Plan: Termine der bestaetigten Regelzahlungen, die im Zeitraum galten (ab erster zugeordneter Buchung, Konsumplaene immer, bis aktiv_bis). Einzelposten = Ausgaben ab 400 Euro ohne Regelzahlung, bewusst nicht im Plan.",
    "",
    `Einnahmen: Ist ${centsToDecimal(w(r.einnahmen.ist_cents))}, Plan ${centsToDecimal(w(r.einnahmen.plan_cents))}, Abweichung ${abw(w(r.einnahmen.ist_cents), w(r.einnahmen.plan_cents))}`,
    ...r.einnahmen.kategorien.flatMap((k) => [zeile(k), ...details(k)]),
    "",
    `Ausgaben: Ist ${centsToDecimal(w(r.ausgaben.ist_cents))}, Plan ${centsToDecimal(w(r.ausgaben.plan_cents))}, Abweichung ${abw(w(r.ausgaben.ist_cents), w(r.ausgaben.plan_cents))}; Einzelposten ${centsToDecimal(w(r.ausgaben.einzel_cents))}, ohne sie ${abw(w(r.ausgaben.ist_cents - r.ausgaben.einzel_cents), w(r.ausgaben.plan_cents))}`,
    ...r.ausgaben.kategorien.flatMap((k) => [zeile(k), ...details(k)]),
    "",
    `Sparen: Ueberschuss Ist ${centsToDecimal(w(ist.ueberschuss_cents))} / Plan ${centsToDecimal(w(plan.ueberschuss_cents))}; Sparquote Ist ${quote(ist.quote)} / Plan ${quote(plan.quote)}`,
    `- Depots: Ist ${centsToDecimal(w(ist.depot_cents))} / Plan ${centsToDecimal(w(plan.depot_cents))}`,
    `- Versicherungsvertraege: Ist ${centsToDecimal(w(ist.versicherung_cents))} / Plan ${centsToDecimal(w(plan.versicherung_cents))}`,
    `- Konten & Tagesgeld (Rest): Ist ${centsToDecimal(w(ist.liquide_cents))} / Plan ${centsToDecimal(w(plan.liquide_cents))}`,
    `Nicht im Ist: Steuererstattungen ${centsToDecimal(w(r.sondereffekte_cents))}, Investitionen ${centsToDecimal(w(r.investitionen_cents))}`,
    "",
    `Regelzahlungen mit Terminen ohne zugeordnete Buchung: ${r.luecken.length}`,
    ...r.luecken.map((l) => `- ${l.regelzahlung_id} ${l.bezeichnung} (${l.konto_id}): ${l.fehlend.length} von ${l.termine} offen, ${l.fehlend.slice(0, 6).join(", ")}${l.fehlend.length > 6 ? " ..." : ""}`),
  ];
  if (["jahr", "quartal", "monat"].includes(verlauf)) {
    zeilen.push("", `Verlauf je ${verlauf} (Ø je Monat; Einnahmen, Ausgaben, Ueberschuss jeweils Ist/Plan, Sparquote Ist/Plan):`);
    for (const p of perioden(alle, verlauf)) {
      const x = planIst(data, p.monate);
      const m = (c) => centsToDecimal(Math.round(c / p.monate.length));
      zeilen.push(`- ${p.schluessel}${p.vollstaendig ? "" : " (angeschnitten)"}: Einnahmen ${m(x.einnahmen.ist_cents)}/${m(x.einnahmen.plan_cents)}, Ausgaben ${m(x.ausgaben.ist_cents)}/${m(x.ausgaben.plan_cents)}, Ueberschuss ${m(x.sparen.ist.ueberschuss_cents)}/${m(x.sparen.plan.ueberschuss_cents)}, Sparquote ${quote(x.sparen.ist.quote)}/${quote(x.sparen.plan.quote)}`);
    }
  }
  return zeilen.join("\n");
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
    `  Qualitaet: belegt ${q.belegt}, geschaetzt ${q.geschaetzt}, fehlend ${q.fehlend}, gesamt ${q.gesamt ?? "offen"}${netto.unbekannt ? ` (${netto.unbekannt} Position(en) unbekannt, zaehlen 0: Summe ist ein bekannter Teilbestand)` : ""}`,
    "  Positionen (Bewertungsstand zum Stichtag; nur Werte bis zum Stichtag; Konten = juengster Anker + Buchungen danach, ohne Anker bis dahin aus dem naechsten spaeteren Anker zurueckgerechnet; Methode in Klammern):",
    ...netto.positionen.map((p) => `  * ${p.klasse} ${p.id} ${p.name}: ${p.unbekannt ? `unbekannt (${p.basis})` : `${eur(p.wert_cents)}, Stand ${p.standdatum ?? "-"}, ${p.qualitaet ?? "offen"} (${p.methode})`}`),
    ...(netto.ausserhalb.length ? [`  Nicht im Stand (Lebenszyklus): ${netto.ausserhalb.map((x) => `${x.klasse} ${x.id} ${x.lebenszyklus}`).join(", ")}`] : []),
    "",
    `Verfuegbares Geld: ${eur(gruppen.konten.summe_cents)} (= Summe Konten der Tabelle, ${abdeckung(gruppen.konten)})`,
    `Summe Depots: ${eur(gruppen.depots.summe_cents)} (${abdeckung(gruppen.depots)})`,
    "",
    ...monatsZeilen(data, stichtag),
    "",
    `Summe geladener Bewegungen (Konten): ${eur(saldoGeladenerKonten(data))}`,
    "  Nur geladene Buchungen liquiditaetsrelevanter Konten ohne Depots, kein Anfangssaldo, ohne Stichtagsbezug.",
    "",
    "Konten (Tabelle der Uebersicht; Wert und Stand aus dem Bewertungsstand wie im Nettovermoegen):",
    ...sortierteKonten(data, stichtag).map((k) => {
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
