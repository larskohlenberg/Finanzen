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

// Unter Name und Betrag ueber die volle Breite: Art der Leistung, Vorbehalte,
// Standdatum. Kurz gehalten, damit die Zeile nicht umbricht.
const postenNotiz = (p) => [
  t(FELD_LABEL[p.feld]),
  p.qualitaet === "geschaetzt" ? t("absicherung.geschaetzt") : "",
  BEFRISTET.has(p.feld) ? t("absicherung.befristet") : "",
  p.einkommensanrechnung ? `${t("absicherung.vorAnrechnung")}*` : "",
  formatDate(p.standdatum),
].filter(Boolean).join(" · ");

function postenHtml(p) {
  const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === p.vorsorge_id) ?? { name: p.name };
  return `
          <li>
            <a class="linkish" href="${escapeHtml(zielRoute("open-vorsorge", p.vorsorge_id))}" data-action="open-vorsorge" data-vorsorge="${escapeHtml(p.vorsorge_id)}" title="${escapeHtml(p.name)}">${mitLogo({ vorsorge: vs }, escapeHtml(p.name))}</a>
            <span class="muted">${escapeHtml(postenNotiz(p))}</span>
            <span class="amount">${escapeHtml(betrag(p.wert_cents, EINMALIG.has(p.feld)))}</span>
          </li>`;
}

// Ein Block je Person: Name mit Hauptbetrag, darunter klein ein Zusatzbetrag
// (eigene Zeile statt Umbruch), aufgeklappt die einzelnen Leistungen. Die ganze
// Zeile ist der Klappknopf, Standard zu; der Zustand gilt je Fall und Person
// (klappKacheln).
function personHtml(fall, person, haupt, zusatz, posten) {
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
            <button type="button" class="klapp-knopf absicherung-person-kopf" data-action="klapp-kachel" data-kachel="${escapeHtml(id)}" data-standard="false" aria-expanded="${offen}">${iconSvg(offen ? "chevronDown" : "chevronRight")}<span class="absicherung-person-name">${escapeHtml(person.name)}</span><strong>${escapeHtml(haupt)}</strong>${zusatz ? `<span class="absicherung-person-zusatz">${escapeHtml(zusatz)}</span>` : ""}</button>
          </h3>
          ${offen ? `<ul class="absicherung-posten">${posten.map(postenHtml).join("")}</ul>` : ""}
        </div>`;
}

// BU: Hauptbetrag sind die BU-Renten; die Erwerbsminderungsrente fliesst erst
// bei voller Erwerbsminderung und steht als Gesamtbetrag darunter.
function buBetraege(bu) {
  const haupt = bu.monatlich_cents ? betrag(bu.monatlich_cents, false) : t("absicherung.keineBuRente");
  const zusatz = bu.erwerbsminderung_cents > bu.monatlich_cents ? tf("absicherung.beiErwerbsminderung", { betrag: formatMoney(bu.erwerbsminderung_cents) }) : "";
  return [haupt, zusatz];
}

// Tod: Hauptbetrag einmalig, laufende Renten darunter; ohne Einmalbetrag sind
// die laufenden der Hauptbetrag. Steht ein Wert vor Einkommensanrechnung, traegt
// der laufende Betrag einen Stern wie der Posten.
function todBetraege(tod) {
  const stern = tod.posten.some((p) => p.einkommensanrechnung) ? "*" : "";
  const laufend = tod.monatlich_cents ? `${betrag(tod.monatlich_cents, false)}${stern}` : "";
  if (!tod.einmalig_cents) return [laufend, ""];
  return [betrag(tod.einmalig_cents, true), laufend && tf("absicherung.dazu", { betrag: laufend })];
}

function kachelHtml(fall, personen, personBlock, { kopfLink }) {
  const inhalt = personen.length
    ? personen.map(personBlock).join("")
    : `<p class="muted">${escapeHtml(t("absicherung.keinePersonen"))}</p>`;
  const titel = `${iconSvg("vorsorge")}<span>${escapeHtml(t(`absicherung.${fall}Titel`))}</span>`;
  const kopf = kopfLink ? `<button class="linkish" data-view="vorsorge">${titel}${iconSvg("chevronRight")}</button>` : `<span class="uebersicht-kachel-titel">${titel}</span>`;
  return `
      <section class="panel panel-pad absicherung-kachel" aria-labelledby="absicherung-${fall}-titel">
        <h2 class="uebersicht-kachel-kopf" id="absicherung-${fall}-titel">${kopf}</h2>
        ${inhalt}
      </section>`;
}

// Zwei Kacheln fuer die Uebersicht, Berufsunfaehigkeit und Tod, darin je
// Person die Summe und die Posten. personen: Ergebnis von absicherung()
// (in der Uebersicht vom Server, GET /api/v1/uebersicht). kopfLink: Titel
// fuehrt zur Vorsorgeseite (auf ihr selbst aus).
export function renderAbsicherungKacheln(personen, { kopfLink = true } = {}) {
  return `
    <div class="absicherung-kacheln">
      ${kachelHtml("bu", personen, (p) => personHtml("bu", p, ...buBetraege(p.bu), p.bu.posten), { kopfLink })}
      ${kachelHtml("tod", personen, (p) => personHtml("tod", p, ...todBetraege(p.tod), p.tod.posten), { kopfLink })}
    </div>`;
}
