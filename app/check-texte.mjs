// app/check-texte.mjs
// Saetze zu den strukturierten Pruefbefunden der Rechenmodule (Vermoegens-
// Checks aus vermoegen.mjs, Szenario-Warnungen aus szenarien.mjs). Die
// Rechenmodule liefern nur Code, Objekt und Werte (Cent, ISO-Datum); wie Geld
// und Datum aussehen, gibt der Aufrufer vor: die Oberflaeche ihre lokalen
// Formatierer, MCP Decimal-Strings und ISO-Daten (Standard). Rein, ohne DOM.
import { centsToDecimal } from "./tools/lib/text.mjs";

const STANDARD = { geld: (cents) => centsToDecimal(cents), datum: (iso) => iso };
const KLASSE = { konto: "Konto", immobilie: "Immobilie", vermoegenswert: "Vermögenswert", vorsorge: "Vorsorge", darlehen: "Darlehen", frist: "Frist" };
const monate = (n) => `${n} ${n === 1 ? "Monat" : "Monate"}`;

export function vermoegenCheckText(c, format = {}) {
  const { geld, datum } = { ...STANDARD, ...format };
  const objekt = `${c.entitaet === "konto" && c.art !== "anker-fehlt" && c.art !== "reconciliation-drift" ? "Depot" : KLASSE[c.entitaet] ?? c.entitaet} ${c.name ?? c.entitaet_id}`;
  switch (c.art) {
    case "anker-fehlt": return `${objekt}: kein belegter ${c.entitaet === "darlehen" ? "Restschuldstand" : "Kontostand"}`;
    case "reconciliation-drift": return `${objekt}: Buchungen passen nicht zum Kontoauszug ${datum(c.bis)} (erwartet ${geld(c.erwartet_cents)}, belegt ${geld(c.belegt_cents)})`;
    case "marktwert-fehlt": return `${objekt}: kein ${c.entitaet === "konto" ? "Depotwert" : "Marktwert"}`;
    case "bewertung-veraltet": return `${objekt}: ${c.entitaet === "konto" ? "Depotwert" : c.entitaet === "immobilie" ? "Marktwert" : "Wert"} vom ${datum(c.standdatum)} älter als ${monate(c.schwelle_monate)}`;
    case "darlehen-ohne-regelzahlung": return `${objekt}: Rate nicht in der Liquiditätsprognose — Regelzahlung anlegen?`;
    case "darlehen-rate-abweichung": return `${objekt}: Regelzahlung ${c.regelzahlung_id} zahlt ${geld(c.rate_cents)}, Sollrate ${geld(c.sollrate_cents)} — Tilgung rechnet mit der Regelzahlung`;
    case "vorsorge-dynamik": return `${objekt}: Dynamik zum ${datum(c.termin)} entscheiden${c.vorschlag ? ` — nach der Regel „nur jede dritte annehmen“: ${c.vorschlag}${c.letzte_chance ? " (ein weiterer Widerspruch beendet das Dynamikrecht)" : ""}` : " — Verlauf unvollständig, frühere Entscheidungen aus den Lastschriften klären"}`;
    case "vorsorge-ungeprueft": return `${objekt}: ungeprüfter Anspruch — darf nicht als sicherer Zukunftswert gelten`;
    case "vorsorge-wiedervorlage": return `${objekt}: letzte Prüfung/Mitteilung vom ${datum(c.standdatum)} älter als ${monate(c.schwelle_monate)} — Werte verifizieren (z. B. Gesetzesänderung)`;
    case "vorsorge-wechsel": return c.fall === "deckungsluecke"
      ? `${objekt}: Deckungslücke — alt endet ${datum(c.ende)}, Nachfolge ${c.nachfolger_name} beginnt ${c.beginn ? datum(c.beginn) : "ohne Beitrag"}`
      : `${objekt}: Beitrag endet ${datum(c.ende)}, keine Nachfolge erkennbar — Wechsel oder bewusste Kündigung?`;
    case "frist-ueberfaellig": return `Frist ${c.frist_id} ${c.name}: fällig am ${datum(c.datum)}, nicht erledigt — erledigen und erledigt_bis setzen`;
    default: return `${objekt}: ${c.art}`;
  }
}

export function szenarioWarnungText(w, format = {}) {
  const { geld, datum } = { ...STANDARD, ...format };
  switch (w.code) {
    case "aenderung-wirkungslos":
      if (w.fall === "unbekannt") return `Änderung auf unbekannte Regelzahlung ${w.regelzahlung_id}`;
      if (w.fall === "vor-anker") return `Änderung ${w.annahme_id} liegt vor dem Anker der Regelzahlung`;
      if (w.fall === "abgelaufen") return `Regelzahlung ${w.regelzahlung_id} ist vor ${datum(w.datum)} bereits abgelaufen`;
      return `Änderung ${w.annahme_id}: Regelzahlung ${w.regelzahlung_id} ist im Szenario bereits beendet`;
    case "ereignis-ohne-wirkung": return `Ereignis ${w.annahme_id}: kein Vertrag mit Beitragsbefreiung oder BU-Leistung für ${w.person_id}`;
    case "vorsorge-unbekannt": return `Annahme ${w.annahme_id} verweist auf unbekannte Vorsorge ${w.vorsorge_id}`;
    case "vorsorge-leistung-ohne-wert": return `Vorsorge ${w.vorsorge_id} hat keinen ${w.feld}-Zeitwert`;
    case "startbestand-unbekannt": return `Startbestand unvollständig, ohne belegten Wert: ${(w.positionen ?? []).map((p) => `${KLASSE[p.klasse] ?? p.klasse} ${p.name}`).join(", ")}`;
    case "depot-ueberzogen": return `Verkauf übersteigt verfügbaren Depotwert (${w.annahme_id})`;
    case "depot-vorbehalt": return w.vorbehalt ?? `Gegenbuchung auf Depot ${w.konto_id} ist ein Vorbehalt, kein Garant`;
    case "annahme-vergangen": return `Annahme ${w.annahme_id} liegt vor dem Rechenstichtag`;
    case "liquiditaet-negativ": return "Liquidität bereits im ersten Monat negativ";
    case "cash-realismus": return `Geplante Ausgaben für ${w.kategorie_id} (${geld(w.plan_cents)}/Monat) liegen deutlich unter dem Ist-Durchschnitt (${geld(w.ist_cents)}/Monat)`;
    case "kategorie-ungeplant": return `Kategorie ${w.kategorie_id} hat materielles Ist (${geld(w.ist_cents)}/Monat), aber keine geplante Regelzahlung`;
    default: return w.code;
  }
}
