// app/views/absicherung.mjs
// Kacheln Absicherung: je Fall (Berufsunfaehigkeit, Tod) eine Kachel, darin je
// Person die Summe und die einzelnen Leistungen mit Link auf ihren Vertrag.
// Nur auflisten, kein Bedarf. Rechnen in absicherung.mjs. Steht auf der
// Uebersicht und im Uebersichtstab der Vorsorgeseite.
import { data, state, t, tf, escapeHtml } from "../runtime.mjs";
import { zielRoute } from "../routing.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, mitLogo } from "../komponenten.mjs";

const FELD_LABEL = {
  bu_rente: "vorsorge.buRente",
  erwerbsminderungsrente: "vorsorge.erwerbsminderungsrente",
  todesfallleistung: "vorsorge.todesfallleistung",
  hinterbliebenenrente: "vorsorge.hinterbliebenenrente",
  waisenrente: "vorsorge.waisenrente",
};

const BEFRISTET = new Set(["waisenrente"]);

const EINMALIG = new Set(["todesfallleistung"]);

const betrag = (cents, einmalig) => tf(einmalig ? "absicherung.einmalig" : "absicherung.jeMonat", { betrag: formatMoney(cents) });

// Unter dem Namen: Art der Leistung, Vorbehalte, Stand.
const postenNotiz = (p) => [
  t(FELD_LABEL[p.feld]),
  p.qualitaet === "geschaetzt" ? t("absicherung.geschaetzt") : "",
  BEFRISTET.has(p.feld) ? t("absicherung.befristet") : "",
  p.einkommensanrechnung ? `${t("absicherung.vorAnrechnung")}*` : "",
  tf("absicherung.stand", { datum: formatDate(p.standdatum) }),
].filter(Boolean).join(" · ");

function postenHtml(p) {
  const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === p.vorsorge_id) ?? { name: p.name };
  return `
          <li>
            <a class="linkish" href="${escapeHtml(zielRoute("open-vorsorge", p.vorsorge_id))}" data-action="open-vorsorge" data-vorsorge="${escapeHtml(p.vorsorge_id)}">${mitLogo({ vorsorge: vs }, escapeHtml(p.name))}</a>
            <span class="muted">${escapeHtml(postenNotiz(p))}</span>
            <span class="amount">${escapeHtml(betrag(p.wert_cents, EINMALIG.has(p.feld)))}</span>
          </li>`;
}

// Ein Block je Person: Name mit Summe, aufgeklappt darunter die einzelnen
// Leistungen. Die ganze Zeile ist der Klappknopf, Standard zu; der Zustand
// gilt je Fall und Person (klappKacheln). Steht in einer Summe ein Wert vor
// Einkommensanrechnung, traegt sie einen Stern (Fussnote der Kachel).
function personHtml(fall, person, summen, posten) {
  const stern = (einmalig) => (!einmalig && posten.some((p) => p.einkommensanrechnung) ? "*" : "");
  const summe = summen.filter(([cents]) => cents).map(([cents, einmalig]) => `${betrag(cents, einmalig)}${stern(einmalig)}`).join(" · ");
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

function kachelHtml(fall, personen, personBlock, { kopfLink, hinweis }) {
  const inhalt = personen.length
    ? personen.map(personBlock).join("")
    : `<p class="muted">${escapeHtml(t("absicherung.keinePersonen"))}</p>`;
  const titel = `${iconSvg("vorsorge")}<span>${escapeHtml(t(`absicherung.${fall}Titel`))}</span>`;
  const kopf = kopfLink ? `<button class="linkish" data-view="vorsorge">${titel}${iconSvg("chevronRight")}</button>` : `<span class="uebersicht-kachel-titel">${titel}</span>`;
  return `
      <section class="panel panel-pad absicherung-kachel" aria-labelledby="absicherung-${fall}-titel">
        <h2 class="uebersicht-kachel-kopf" id="absicherung-${fall}-titel">${kopf}</h2>
        ${inhalt}${hinweis ? `
        <p class="muted absicherung-hinweis">${escapeHtml(hinweis)}</p>` : ""}
      </section>`;
}

// Zwei Kacheln fuer die Uebersicht, Berufsunfaehigkeit und Tod, darin je
// Person die Summe und die Posten. personen: Ergebnis von absicherung()
// (in der Uebersicht vom Server, GET /api/v1/uebersicht). kopfLink: Titel
// fuehrt zur Vorsorgeseite (auf ihr selbst aus).
export function renderAbsicherungKacheln(personen, { kopfLink = true } = {}) {
  const anrechnung = personen.some((p) => p.tod.posten.some((x) => x.einkommensanrechnung));
  return `
    <div class="absicherung-kacheln">
      ${kachelHtml("bu", personen, (p) => personHtml("bu", p, [[p.bu.monatlich_cents, false]], p.bu.posten), { kopfLink })}
      ${kachelHtml("tod", personen, (p) => personHtml("tod", p, [[p.tod.einmalig_cents, true], [p.tod.monatlich_cents, false]], p.tod.posten), { kopfLink, hinweis: anrechnung ? t("absicherung.anrechnungHinweis") : "" })}
    </div>`;
}
