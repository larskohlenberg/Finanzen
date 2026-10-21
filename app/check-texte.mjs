// app/check-texte.mjs
// Saetze zu den strukturierten Pruefbefunden der Rechenmodule (Vermoegens-
// Checks aus vermoegen.mjs, Szenario-Warnungen aus szenarien.mjs). Die
// Rechenmodule liefern nur Code, Objekt und Werte (Cent, ISO-Datum); wie Geld
// und Datum aussehen, gibt der Aufrufer vor: die Oberflaeche ihre lokalen
// Formatierer, MCP Decimal-Strings und ISO-Daten (Standard). Rein, ohne DOM.
//
// Die Saetze sind Vorlagen mit {Platzhaltern} (VORLAGEN, Deutsch als
// Standard). Die Oberflaeche uebergibt mit `vorlage(schluessel)` die Vorlagen
// ihrer Sprache (i18n.js, Bereich checkText); fehlt dort eine, gilt Deutsch.
import { centsToDecimal } from "./tools/lib/text.mjs";
import { fuelle } from "./format.mjs";

export const VORLAGEN = Object.freeze({
  "klasse-konto": "Konto",
  "klasse-depot": "Depot",
  "klasse-immobilie": "Immobilie",
  "klasse-vermoegenswert": "Vermögenswert",
  "klasse-vorsorge": "Vorsorge",
  "klasse-darlehen": "Darlehen",
  "klasse-frist": "Frist",
  monat: "{n} Monat",
  monate: "{n} Monate",
  "was-kontostand": "Kontostand",
  "was-restschuld": "Restschuldstand",
  "wert-depot": "Depotwert",
  "wert-markt": "Marktwert",
  "wert-allgemein": "Wert",
  "anker-fehlt": "{objekt}: kein belegter {was}",
  "reconciliation-drift": "{objekt}: Buchungen passen nicht zum Kontoauszug {bis} (erwartet {erwartet}, belegt {belegt})",
  "marktwert-fehlt": "{objekt}: kein {wert}",
  "bewertung-veraltet": "{objekt}: {wert} vom {datum} älter als {dauer}",
  "darlehen-ohne-regelzahlung": "{objekt}: Rate nicht in der Liquiditätsprognose — Regelzahlung anlegen?",
  "enddatum-fehlt": "{objekt}: beendet, aber ohne Enddatum (aktiv_bis) — zählt bis zum letzten bekannten Stand {datum}; Enddatum eintragen",
  "enddatum-fehlt-ohne-stand": "{objekt}: beendet, aber ohne Enddatum (aktiv_bis) und ohne bekannten Stand — zählt gar nicht; Enddatum eintragen",
  "darlehen-rate-abweichung": "{objekt}: Regelzahlung {rz} zahlt {rate}, Sollrate {soll} — Tilgung rechnet mit der Regelzahlung",
  "vorsorge-dynamik": "{objekt}: Dynamik zum {termin} entscheiden{zusatz}",
  "dynamik-vorschlag": " — nach der Regel „nur jede dritte annehmen“: {vorschlag}{chance}",
  "dynamik-letzte-chance": " (ein weiterer Widerspruch beendet das Dynamikrecht)",
  "dynamik-unvollstaendig": " — Verlauf unvollständig, frühere Entscheidungen aus den Lastschriften klären",
  "vorsorge-ungeprueft": "{objekt}: ungeprüfter Anspruch — darf nicht als sicherer Zukunftswert gelten",
  "vorsorge-wiedervorlage": "{objekt}: letzte Prüfung/Mitteilung vom {datum} älter als {dauer} — Werte verifizieren (z. B. Gesetzesänderung)",
  "vorsorge-wechsel-luecke": "{objekt}: Deckungslücke — alt endet {ende}, Nachfolge {nachfolger} beginnt {beginn}",
  "ohne-beitrag": "ohne Beitrag",
  "vorsorge-wechsel-ende": "{objekt}: Beitrag endet {ende}, keine Nachfolge erkennbar — Wechsel oder bewusste Kündigung?",
  "frist-ueberfaellig": "Frist {id} {name}: fällig am {datum}, nicht erledigt — erledigen und erledigt_bis setzen",
  "check-sonst": "{objekt}: {art}",
  "aenderung-unbekannt": "Änderung auf unbekannte Regelzahlung {rz}",
  "aenderung-vor-anker": "Änderung {annahme} liegt vor dem Anker der Regelzahlung",
  "aenderung-abgelaufen": "Regelzahlung {rz} ist vor {datum} bereits abgelaufen",
  "aenderung-beendet": "Änderung {annahme}: Regelzahlung {rz} ist im Szenario bereits beendet",
  "ereignis-ohne-wirkung": "Ereignis {annahme}: kein Vertrag mit Beitragsbefreiung oder BU-Leistung für {person}",
  "vorsorge-unbekannt": "Annahme {annahme} verweist auf unbekannte Vorsorge {vorsorge}",
  "vorsorge-leistung-ohne-wert": "Vorsorge {vorsorge} hat keinen {feld}-Zeitwert",
  "beitragsfrei-stichtag": "Annahme {annahme}: beitragsfreier Wert von {vorsorge} gilt für die Freistellung zum {stichtag}, angenommen ist {datum}",
  "startbestand-unbekannt": "Startbestand unvollständig, ohne belegten Wert: {positionen}",
  "depot-ueberzogen": "Verkauf übersteigt verfügbaren Depotwert ({annahme})",
  "depot-vorbehalt": "Gegenbuchung auf Depot {konto} ist ein Vorbehalt, kein Garant",
  "annahme-vergangen": "Annahme {annahme} liegt vor dem Rechenstichtag",
  "liquiditaet-negativ": "Liquidität bereits im ersten Monat negativ",
  "cash-realismus": "Geplante Ausgaben für {kategorie} ({plan}/Monat) liegen deutlich unter dem Ist-Durchschnitt ({ist}/Monat)",
  "kategorie-ungeplant": "Kategorie {kategorie} hat materielles Ist ({ist}/Monat), aber keine geplante Regelzahlung",
});

const STANDARD = { geld: (cents) => centsToDecimal(cents), datum: (iso) => iso, vorlage: () => undefined };

function texter(format) {
  const f = { ...STANDARD, ...format };
  const v = (schluessel) => f.vorlage(schluessel) ?? VORLAGEN[schluessel];
  return { ...f, satz: (schluessel, werte = {}) => fuelle(v(schluessel), werte), wort: v };
}

export function vermoegenCheckText(c, format = {}) {
  const { geld, datum, satz, wort } = texter(format);
  const klasse = c.entitaet === "konto" && c.art !== "anker-fehlt" && c.art !== "reconciliation-drift" && c.art !== "enddatum-fehlt" ? "depot" : c.entitaet;
  const objekt = `${wort(`klasse-${klasse}`) ?? c.entitaet} ${c.name ?? c.entitaet_id}`;
  const dauer = (n) => satz(n === 1 ? "monat" : "monate", { n });
  switch (c.art) {
    case "anker-fehlt": return satz("anker-fehlt", { objekt, was: wort(c.entitaet === "darlehen" ? "was-restschuld" : "was-kontostand") });
    case "reconciliation-drift": return satz("reconciliation-drift", { objekt, bis: datum(c.bis), erwartet: geld(c.erwartet_cents), belegt: geld(c.belegt_cents) });
    case "marktwert-fehlt": return satz("marktwert-fehlt", { objekt, wert: wort(c.entitaet === "konto" ? "wert-depot" : "wert-markt") });
    case "bewertung-veraltet": return satz("bewertung-veraltet", { objekt, wert: wort(c.entitaet === "konto" ? "wert-depot" : c.entitaet === "immobilie" ? "wert-markt" : "wert-allgemein"), datum: datum(c.standdatum), dauer: dauer(c.schwelle_monate) });
    case "darlehen-ohne-regelzahlung": return satz("darlehen-ohne-regelzahlung", { objekt });
    case "enddatum-fehlt": return c.letzter_stand ? satz("enddatum-fehlt", { objekt, datum: datum(c.letzter_stand) }) : satz("enddatum-fehlt-ohne-stand", { objekt });
    case "darlehen-rate-abweichung": return satz("darlehen-rate-abweichung", { objekt, rz: c.regelzahlung_id, rate: geld(c.rate_cents), soll: geld(c.sollrate_cents) });
    case "vorsorge-dynamik": return satz("vorsorge-dynamik", {
      objekt,
      termin: datum(c.termin),
      zusatz: c.vorschlag ? satz("dynamik-vorschlag", { vorschlag: c.vorschlag, chance: c.letzte_chance ? wort("dynamik-letzte-chance") : "" }) : wort("dynamik-unvollstaendig"),
    });
    case "vorsorge-ungeprueft": return satz("vorsorge-ungeprueft", { objekt });
    case "vorsorge-wiedervorlage": return satz("vorsorge-wiedervorlage", { objekt, datum: datum(c.standdatum), dauer: dauer(c.schwelle_monate) });
    case "vorsorge-wechsel": return c.fall === "deckungsluecke"
      ? satz("vorsorge-wechsel-luecke", { objekt, ende: datum(c.ende), nachfolger: c.nachfolger_name, beginn: c.beginn ? datum(c.beginn) : wort("ohne-beitrag") })
      : satz("vorsorge-wechsel-ende", { objekt, ende: datum(c.ende) });
    case "frist-ueberfaellig": return satz("frist-ueberfaellig", { id: c.frist_id, name: c.name, datum: datum(c.datum) });
    default: return satz("check-sonst", { objekt, art: c.art });
  }
}

export function szenarioWarnungText(w, format = {}) {
  const { geld, datum, satz, wort } = texter(format);
  switch (w.code) {
    case "aenderung-wirkungslos":
      if (w.fall === "unbekannt") return satz("aenderung-unbekannt", { rz: w.regelzahlung_id });
      if (w.fall === "vor-anker") return satz("aenderung-vor-anker", { annahme: w.annahme_id });
      if (w.fall === "abgelaufen") return satz("aenderung-abgelaufen", { rz: w.regelzahlung_id, datum: datum(w.datum) });
      return satz("aenderung-beendet", { annahme: w.annahme_id, rz: w.regelzahlung_id });
    case "ereignis-ohne-wirkung": return satz("ereignis-ohne-wirkung", { annahme: w.annahme_id, person: w.person_id });
    case "vorsorge-unbekannt": return satz("vorsorge-unbekannt", { annahme: w.annahme_id, vorsorge: w.vorsorge_id });
    case "vorsorge-leistung-ohne-wert": return satz("vorsorge-leistung-ohne-wert", { vorsorge: w.vorsorge_id, feld: w.feld });
    case "beitragsfrei-stichtag": return satz("beitragsfrei-stichtag", { annahme: w.annahme_id, vorsorge: w.vorsorge_id, stichtag: datum(w.stichtag), datum: datum(w.datum) });
    case "startbestand-unbekannt": return satz("startbestand-unbekannt", { positionen: (w.positionen ?? []).map((p) => `${wort(`klasse-${p.klasse}`) ?? p.klasse} ${p.name}`).join(", ") });
    case "depot-ueberzogen": return satz("depot-ueberzogen", { annahme: w.annahme_id });
    case "depot-vorbehalt": return w.vorbehalt ?? satz("depot-vorbehalt", { konto: w.konto_id });
    case "annahme-vergangen": return satz("annahme-vergangen", { annahme: w.annahme_id });
    case "liquiditaet-negativ": return wort("liquiditaet-negativ");
    case "cash-realismus": return satz("cash-realismus", { kategorie: w.kategorie_id, plan: geld(w.plan_cents), ist: geld(w.ist_cents) });
    case "kategorie-ungeplant": return satz("kategorie-ungeplant", { kategorie: w.kategorie_id, ist: geld(w.ist_cents) });
    default: return w.code;
  }
}
