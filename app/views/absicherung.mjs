// app/views/absicherung.mjs
// Kachel Absicherung: je Person eine Spalte mit den Faellen Berufsunfaehigkeit
// und Tod, darin die Summe und die einzelnen Leistungen mit Link auf ihren
// Vertrag. Nur auflisten, kein Bedarf. Rechnen in absicherung.mjs.
import { data, t, escapeHtml } from "../runtime.mjs";
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

function fallHtml(titelKey, summen, posten) {
  const summe = summen.filter(([cents]) => cents).map(([cents, einmalig]) => betrag(cents, einmalig)).join(" · ");
  return `
        <div class="absicherung-fall">
          <div class="absicherung-fall-kopf">
            <h4>${escapeHtml(t(titelKey))}</h4>
            ${posten.length ? `<strong>${escapeHtml(summe)}</strong>` : `<span class="muted">${escapeHtml(t("absicherung.nichtErfasst"))}</span>`}
          </div>
          ${posten.length ? `<ul class="absicherung-posten">${posten.map(postenHtml).join("")}</ul>` : ""}
        </div>`;
}

function personHtml(person) {
  return `
      <div class="absicherung-person">
        <h3 class="section-subtitle">${escapeHtml(person.name)}</h3>
        ${fallHtml("absicherung.bu", [[person.bu.monatlich_cents, false]], person.bu.posten)}
        ${fallHtml("absicherung.tod", [[person.tod.einmalig_cents, true], [person.tod.monatlich_cents, false]], person.tod.posten)}
      </div>`;
}

// Fertige Kachel fuer die Uebersicht; today nur fuer Tests.
export function renderAbsicherungKachel(today = localTodayIso()) {
  const personen = absicherung(data, today);
  const inhalt = personen.length
    ? `<div class="absicherung-spalten">${personen.map(personHtml).join("")}</div>`
    : `<p class="muted">${escapeHtml(t("absicherung.keinePersonen"))}</p>`;
  return `
    <section class="panel panel-pad absicherung-kachel" aria-labelledby="absicherung-titel">
      <h2 class="section-title" id="absicherung-titel"><button class="linkish" data-view="vorsorge">${escapeHtml(t("absicherung.titel"))}</button></h2>
      <p class="page-lead">${escapeHtml(t("absicherung.lead"))}</p>
      ${inhalt}
    </section>`;
}
