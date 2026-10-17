// app/vorsorge-dynamik.mjs
// Beitragsdynamik eines Vorsorgevertrags: Verlauf der Entscheidungen, naechster
// Erhoehungstermin und der Vorschlag nach der Haushaltsregel "nur jede dritte
// Dynamik annehmen". Viele Versicherer lassen das Dynamikrecht nach drei
// Widerspruechen in Folge erloeschen; die Regel nimmt deshalb an, sobald die
// beiden vorherigen abgelehnt wurden, und lehnt ab, wenn eine davon angenommen
// wurde. Reine Rechnung ohne DOM. Fristen (bis wann widersprechen) stehen nicht
// hier, sondern in der Fristenliste.
import { addInterval } from "./liquiditaet.mjs";

export const DYNAMIK_ERLISCHT_NACH = 3;
// So lange vor dem Erhoehungstermin gilt eine fehlende Entscheidung als offen.
export const DYNAMIK_VORLAUF_TAGE = 90;

const ENTSCHIEDEN = new Set(["angenommen", "abgelehnt"]);
const jahr = (iso) => Number(iso.slice(0, 4));
const amTermin = (j, termin) => `${j}-${termin}`;

// Stand der Dynamik oder null, wenn der Vertrag keine hat.
// { termin, erlischt_nach, verlauf, letzte_entscheidung, ablehnungen_in_folge,
//   erloschen, naechster_termin, angebot_offen, vorschlag, grund, letzte_chance,
//   luecke, entscheidung_noetig }
// vorschlag: "annehmen" | "ablehnen" | null; grund: "letzte-chance" |
// "kuerzlich-angenommen" | "zwei-abgelehnt" | "verlauf-unvollstaendig" | "erloschen".
export function dynamikStand(vs, today) {
  const d = vs?.dynamik;
  if (!d?.termin) return null;
  const erlischtNach = d.erlischt_nach ?? DYNAMIK_ERLISCHT_NACH;
  const verlauf = [...(d.verlauf ?? [])].sort((a, b) => a.termin.localeCompare(b.termin));
  const entschieden = verlauf.filter((v) => ENTSCHIEDEN.has(v.entscheidung));
  const letzte = entschieden.at(-1) ?? null;
  const nachJahr = new Map(entschieden.map((v) => [jahr(v.termin), v.entscheidung]));

  // Ablehnungen in Folge am Ende des erfassten Verlaufs, nur lueckenlose Jahre.
  let erfasstInFolge = 0;
  for (let j = letzte ? jahr(letzte.termin) : 0; nachJahr.get(j) === "abgelehnt"; j--) erfasstInFolge++;
  const erloschen = erfasstInFolge >= erlischtNach;

  const beendet = vs.status === "beendet" || vs.status === "gekuendigt";
  let naechster = null;
  if (!erloschen && !beendet) {
    // Ein Termin bleibt einen Monat lang der naechste: so lange laeuft meist
    // noch die Widerspruchsfrist.
    const ab = addInterval(today, "monat", -1);
    let j = jahr(ab);
    if (amTermin(j, d.termin) < ab) j++;
    if (letzte) j = Math.max(j, jahr(letzte.termin) + 1);
    naechster = amTermin(j, d.termin);
  }

  const bezugsJahr = naechster ? jahr(naechster) : letzte ? jahr(letzte.termin) + 1 : jahr(today);
  let inFolge = 0;
  for (let j = bezugsJahr - 1; nachJahr.get(j) === "abgelehnt"; j--) inFolge++;
  const vorjahre = [nachJahr.get(bezugsJahr - 1), nachJahr.get(bezugsJahr - 2)];
  const luecke = vorjahre.includes(undefined);

  let vorschlag = null;
  let grund;
  if (erloschen) grund = "erloschen";
  else if (inFolge >= erlischtNach - 1) { vorschlag = "annehmen"; grund = "letzte-chance"; }
  else if (vorjahre.includes("angenommen")) { vorschlag = "ablehnen"; grund = "kuerzlich-angenommen"; }
  else if (!luecke) { vorschlag = "annehmen"; grund = "zwei-abgelehnt"; }
  else grund = "verlauf-unvollstaendig";

  const angebotOffen = !!naechster && verlauf.some((v) => v.entscheidung === "offen" && jahr(v.termin) === jahr(naechster));
  return {
    termin: d.termin,
    erlischt_nach: erlischtNach,
    verlauf,
    letzte_entscheidung: letzte,
    ablehnungen_in_folge: erloschen ? erfasstInFolge : inFolge,
    erloschen,
    naechster_termin: naechster,
    angebot_offen: angebotOffen,
    vorschlag,
    grund,
    letzte_chance: !erloschen && inFolge === erlischtNach - 1,
    luecke,
    entscheidung_noetig: !!naechster && (angebotOffen || naechster <= addInterval(today, "tag", DYNAMIK_VORLAUF_TAGE)),
  };
}
