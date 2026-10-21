// app/absicherung.mjs
// Reine Rechnung fuer die Kachel Absicherung: je Person, was bei
// Berufsunfaehigkeit (BU) oder Tod fliesst. Nur auflisten, kein Bedarf, keine
// Luecke. Versicherte Person ist die person_id am Vertrag; wer das Geld bekommt,
// ist nicht modelliert. Kein DOM; Betraege in Cent.
import { toCents } from "./tools/lib/text.mjs";
import { aktuellerZeitwert } from "./vermoegen.mjs";
import { istBeendet } from "./vorsorge-rechnung.mjs";

// Zeitwert-Felder je Fall und Art: monatlich (Rente, brutto) oder einmalig.
const BU_FELDER = ["bu_rente", "erwerbsminderungsrente"];
const TOD_EINMALIG = ["todesfallleistung"];
// hinterbliebenenrente: Witwen-/Witwerrente (lebenslang); waisenrente: alle
// Waisenrenten zusammen (befristet bis 18, in Ausbildung bis 27).
const TOD_MONATLICH = ["hinterbliebenenrente", "waisenrente"];

// Die gesetzliche Witwen-/Witwerrente kuerzt eigenes Einkommen des
// Hinterbliebenen (40 Prozent ueber einem Freibetrag); erfasst ist der Wert davor.
const mitEinkommensanrechnung = (vs, feld) => feld === "hinterbliebenenrente" && vs.art === "gesetzliche-rente";

export const ABSICHERUNG_FELDER = [...BU_FELDER, ...TOD_EINMALIG, ...TOD_MONATLICH];

const personAktiv = (person, today) => person.status === "aktiv" && (!person.aktiv_bis || person.aktiv_bis >= today);

// Groesste Posten zuerst, bei Gleichstand nach Vertrags-ID.
const nachWert = (a, b) => b.wert_cents - a.wert_cents || a.vorsorge_id.localeCompare(b.vorsorge_id);

const summe = (posten) => posten.reduce((s, p) => s + p.wert_cents, 0);

// Je aktiver Person, die versicherte Person mindestens eines laufenden Vertrags
// ist: { person_id, name, bu: { monatlich_cents, posten }, tod: { einmalig_cents,
// monatlich_cents, posten } }. Je Vertrag und Feld zaehlt der juengste Zeitwert
// bis zum Stichtag. Ein Posten traegt die Qualitaet des Zeitwerts und, ob der
// Wert vor einer Einkommensanrechnung steht.
export function absicherung(data, today) {
  const vertraege = (data.vorsorge ?? []).filter((vs) => !istBeendet(vs));
  return (data.personen ?? [])
    .filter((person) => personAktiv(person, today) && vertraege.some((vs) => vs.person_id === person.person_id))
    .map((person) => {
      const posten = (felder) => vertraege
        .filter((vs) => vs.person_id === person.person_id)
        .flatMap((vs) => felder.map((feld) => {
          const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
          return zw && {
            vorsorge_id: vs.vorsorge_id, name: vs.name, feld, wert_cents: toCents(zw.wert), standdatum: zw.standdatum,
            qualitaet: zw.qualitaet, einkommensanrechnung: mitEinkommensanrechnung(vs, feld),
          };
        }))
        .filter(Boolean)
        .sort(nachWert);
      const bu = posten(BU_FELDER);
      const todEinmalig = posten(TOD_EINMALIG);
      const todMonatlich = posten(TOD_MONATLICH);
      return {
        person_id: person.person_id,
        name: person.name,
        bu: { monatlich_cents: summe(bu), posten: bu },
        tod: { einmalig_cents: summe(todEinmalig), monatlich_cents: summe(todMonatlich), posten: [...todEinmalig, ...todMonatlich] },
      };
    });
}
