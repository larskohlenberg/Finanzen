// app/views/absicherung.mjs
// Kacheln Absicherung: je Fall (Berufsunfaehigkeit, Tod) eine Kachel, darin je
// Person die Summe und die einzelnen Leistungen mit Link auf ihren Vertrag.
// Nur auflisten, kein Bedarf. Rechnen in absicherung.mjs.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, mitLogo } from "../komponenten.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { absicherung } from "../absicherung.mjs";
import { tf } from "./vermoegen-teile.mjs";

const FELD_LABEL = {
  bu_rente: "vorsorge.buRente",
  erwerbsminderungsrente: "vorsorge.erwerbsminderungsrente",
  todesfallleistung: "vorsorge.todesfallleistung",
  hinterbliebenenrente: "vorsorge.hinterbliebenenrente",
};

const EINMALIG = new Set(["todesfallleistung"]);

const betrag = (cents, einmalig) => tf(einmalig ? "absicherung.einmalig" : "absicherung.jeMonat", { betrag: formatMoney(cents) });

function postenHtml(p) {
  const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === p.vorsorge_id) ?? { name: p.name };
  return `
          <li>
            <button class="linkish" data-action="open-vorsorge" data-vorsorge="${escapeHtml(p.vorsorge_id)}">${mitLogo({ vorsorge: vs }, escapeHtml(p.name))}</button>
            <span class="muted">${escapeHtml(`${t(FELD_LABEL[p.feld])} · ${tf("absicherung.stand", { datum: formatDate(p.standdatum) })}`)}</span>
            <span class="amount">${escapeHtml(betrag(p.wert_cents, EINMALIG.has(p.feld)))}</span>
          </li>`;
}

// Ein Block je Person: Name mit Summe, aufgeklappt darunter die einzelnen
// Leistungen. Die ganze Zeile ist der Klappknopf, Standard zu; der Zustand
// gilt je Fall und Person (klappKacheln).
function personHtml(fall, person, summen, posten) {
  const summe = summen.filter(([cents]) => cents).map(([cents, einmalig]) => betrag(cents, einmalig)).join(" · ");
  if (!posten.length) {
    return `
        <div class="absicherung-person">
          <div class="absicherung-person-kopf">
            <h3>${escapeHtml(person.name)}</h3>
            <span class="muted">${escapeHtml(t("absicherung.nichtErfasst"))}</span>
          </div>
        </div>`;
  }
  const id = `absicherung.${fall}.${person.person_id}`;
  const offen = state.klappKacheln?.[id] ?? false;
  return `
        <div class="absicherung-person">
          <h3 class="absicherung-person-titel">
            <button type="button" class="klapp-knopf absicherung-person-kopf" data-action="klapp-kachel" data-kachel="${escapeHtml(id)}" data-standard="false" aria-expanded="${offen}">${iconSvg(offen ? "chevronDown" : "chevronRight")}<span class="absicherung-person-name">${escapeHtml(person.name)}</span><strong>${escapeHtml(summe)}</strong></button>
          </h3>
          ${offen ? `<ul class="absicherung-posten">${posten.map(postenHtml).join("")}</ul>` : ""}
        </div>`;
}

function kachelHtml(fall, personen, personBlock) {
  const inhalt = personen.length
    ? personen.map(personBlock).join("")
    : `<p class="muted">${escapeHtml(t("absicherung.keinePersonen"))}</p>`;
  return `
      <section class="panel panel-pad absicherung-kachel" aria-labelledby="absicherung-${fall}-titel">
        <h2 class="uebersicht-kachel-kopf" id="absicherung-${fall}-titel"><button class="linkish" data-view="vorsorge">${iconSvg("vorsorge")}<span>${escapeHtml(t(`absicherung.${fall}Titel`))}</span>${iconSvg("chevronRight")}</button></h2>
        <p class="page-lead">${escapeHtml(t(`absicherung.${fall}Lead`))}</p>
        ${inhalt}
      </section>`;
}

// Zwei Kacheln fuer die Uebersicht, Berufsunfaehigkeit und Tod, darin je
// Person die Summe und die Posten; today nur fuer Tests.
export function renderAbsicherungKacheln(today = localTodayIso()) {
  const personen = absicherung(data, today);
  return `
    <div class="absicherung-kacheln">
      ${kachelHtml("bu", personen, (p) => personHtml("bu", p, [[p.bu.monatlich_cents, false]], p.bu.posten))}
      ${kachelHtml("tod", personen, (p) => personHtml("tod", p, [[p.tod.einmalig_cents, true], [p.tod.monatlich_cents, false]], p.tod.posten))}
    </div>`;
}
