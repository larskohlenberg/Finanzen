// app/views/vorsorge.mjs
// Vorsorgeseite im Aufbau der Vermoegensseite: Kopf (erwartetes Alterseinkommen,
// Kapitalleistungen, Rueckkaufswerte, Beitraege), darunter je Vertragsart ein Tab
// (Renten, Lebensversicherungen, Versicherungen). Im Tab eine Karte je Vertrag,
// darunter der gewaehlte Vertrag in voller Breite. Rechnen in vorsorge-rechnung.mjs.
import { data, state, t, tf, fmt, escapeHtml, cents, personenById, kontenById } from "../runtime.mjs";
import { heuteIso, formatMoney, formatDate, logoMarke, mitLogo, renderPageHead, detailRow, quelleHtml, klappKachel, bemerkungInhalt, kennzahlKachel, kachelZeile, farbPunkt, zeitverlaufKlein } from "../komponenten.mjs";
import { iconSvg } from "../icons.js";
import { aktuellerZeitwert } from "../vermoegen.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { donutDiagramm, wertVerlauf } from "../charts.mjs";
import { belegOrdnerAusText } from "../belege.mjs";
import {
  VORSORGE_TABS, beitragJeJahrVertrag, beitragJeMonatVertrag,
  gesetzlicherRentenbeginn, kapitalLeistungen, kapitalZumAblauf, istBeendet, laufendeBeitraege, leistungsZeitstrahl, monateBis, naechsterBeitrag,
  rentenStufen, tabFuerVorsorge, vertragsFarben,
} from "../vorsorge-rechnung.mjs";
import { dynamikStand, widerspruchFuerFrist } from "../vorsorge-dynamik.mjs";
import { fristenZuObjekt } from "../fristen.mjs";
import { balkenSvg, dokumenteBrowserHtml, fristenText, geld, kennzahl, prozent, qualitaetChip, rhythmusLabel } from "./vermoegen-teile.mjs";

const GRUPPEN_TABS = VORSORGE_TABS.filter((tab) => tab !== "uebersicht");

function personName(personId) {
  return personenById.get(personId)?.name
    || (data.personen ?? []).find((person) => person.person_id === personId)?.name
    || personId
    || "—";
}

function statusLabel(status) {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function vorsorgeArtLabel(art) {
  const key = `vorsorge.art.${art}`;
  const label = t(key);
  return label === key ? art : label;
}

function sparteLabel(sparte) {
  const key = `vorsorge.sparte.${sparte}`;
  const label = t(key);
  return label === key ? sparte : label;
}

// Etikett oben rechts auf der Kachel: bei Versicherungen die Sparte, sonst die Vertragsart.
const kachelEtikett = (vs, tab) => (tab === "versicherungen" ? (vs.sparte ? sparteLabel(vs.sparte) : "") : vorsorgeArtLabel(vs.art));

const zeitwert = (vs, feld) => aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld);
// Feste Farbe je Vertrag (vertragsFarben); Vertraege ohne eigene Farbe sind grau.
const farbKlasse = (farben, id) => (farben.has(id) ? `vertrag-farbe-${farben.get(id)}` : "vertrag-farbe-rest");
// Riester: das Kapital ist zweckgebunden. Der Rueckkaufswert ist nur bei Kuendigung
// (schaedliche Verwendung) erreichbar, zu Rentenbeginn sind hoechstens 30 Prozent
// als Einmalzahlung moeglich, der Rest wird verrentet.
const istRiester = (vs) => vs.art === "riester";
const rkwLabel = (vs) => t(istRiester(vs) ? "vorsorge.riester.gebundenesKapital" : "vorsorge.rueckkaufswert");
const riesterHinweis = (vs) => (istRiester(vs) ? t(`vorsorge.riester.wahl.${vs.kapitalwahl === "kapital" || vs.kapitalwahl === "monatsrente" ? vs.kapitalwahl : "offen"}`) : "");
// Ein Rueckkaufswert zaehlt nur bei kapitalbildenden Vertraegen ins Nettovermoegen.
const ausserhalbVermoegen = (vs, feld) => feld === "vertragswert" || (feld === "rueckkaufswert" && !vs.kapitalbildend);
const vertraegeIm = (tab) => (data.vorsorge ?? []).filter((vs) => tabFuerVorsorge(vs) === tab);
const geldOhneCent = (c) => fmt().geldGanz(c);
const einheit = (text) => `<span class="betrag-einheit">${escapeHtml(text)}</span>`;
const jaehrlichGezahlt = (vs, today) => {
  const rz = laufendeBeitraege(data, vs.vorsorge_id, today);
  return rz.length > 0 && rz.every((r) => r.rhythmus_einheit === "jahr" || (r.rhythmus_einheit === "monat" && Number(r.rhythmus_intervall) % 12 === 0));
};

// Was Buchungen braucht (offene Punkte, Rueckkaufswerte als Positionen des
// Nettovermoegens, je Vertrag Anzahl gebuchter Beitraege, letzte Aenderung,
// Vorjahr, Vermoegensbezug, Wertentwicklung), rechnet der App-Server (GET /api/v1/vorsorge,
// app/vorsorge-modell.mjs). renderVorsorge setzt die Antwort fuer die Dauer
// eines Zeichnens; alles andere rechnet der Browser aus Stammdaten und Zeitwerten.
const cache = erstelleApiCache({ maxEintraege: 4 });
let modell = null;
const OHNE_BUCHUNGEN = { anzahl_buchungen: 0, letzte_aenderung: null, vorjahr: null, bezug: [], wert_entwicklung: null };
// Fehlt der Vertrag in der Antwort (sie ist noch die des vorigen Stands): ohne Buchungen.
const vertrag = (vs) => modell?.vertraege[vs.vorsorge_id] ?? OHNE_BUCHUNGEN;

function vorsorgeAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/vorsorge?${suche}`);
}

// Links auf die Vermoegensgegenstaende eines Vertrags (oeffnet das Objekt auf der Vermoegensseite).
function bezugLinks(vs) {
  return vertrag(vs).bezug.map((b) => {
    const name = (data.immobilien ?? []).find((i) => i.immobilie_id === b.id)?.bezeichnung || b.id;
    return `<button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`${b.klasse}:${b.id}`)}" title="${escapeHtml(t("vorsorge.bezugOeffnen"))}">${escapeHtml(name)}</button>`;
  });
}

// Kacheln im Vertragsdetail: Reihenfolge und Standard (offen/zu).
const KACHEL_OFFEN = { vertragsdaten: false, dokumente: true, beitraege: true, anhang: false };
const kachel = (key, titel, inhalt, klasse = "") => klappKachel({ id: `vorsorge.${key}`, titel, inhalt, offen: KACHEL_OFFEN[key], klasse });

export function resetVorsorgeFilters() {
  state.vorsorgeFilters = { person: "" };
}

// Ein gewaehlter Vertrag bestimmt den Tab; sonst gilt der gemerkte Tab.
function aktiverTab() {
  const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === state.selectedVorsorgeId);
  if (vs) state.vorsorgeTab = tabFuerVorsorge(vs);
  const tab = VORSORGE_TABS.includes(state.vorsorgeTab) ? state.vorsorgeTab : "uebersicht";
  return tab !== "uebersicht" && !vertraegeIm(tab).length ? "uebersicht" : tab;
}

// Offene Pruefpunkte je Vertrag aus den Vermoegens-Checks.
function offenePunkte() {
  const je = new Map();
  for (const c of modell.checks) {
    if (c.entitaet !== "vorsorge") continue;
    if (!je.has(c.entitaet_id)) je.set(c.entitaet_id, []);
    je.get(c.entitaet_id).push(c);
  }
  return je;
}

export function renderVorsorge() {
  const today = heuteIso();
  const { antwort, fehler } = vorsorgeAntwort(today);
  if (!antwort) {
    return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("vorsorge.loadFailed")} (${fehler.message})` : t("vorsorge.loading"))}</p></section>`;
  }
  modell = antwort;
  const offen = offenePunkte();
  const tab = aktiverTab();
  const inhalt = tab === "uebersicht" ? renderUebersichtTab(today, offen) : renderGruppenTab(tab, today, offen);
  return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    ${renderTabs(tab, today, offen)}
    <div class="vermoegen-tab-inhalt" role="tabpanel" id="vorsorge-tab-${tab}">${inhalt}</div>`;
}

// ------------------------------------------------------------- Uebersicht

// Der Uebersichtstab traegt die Kennzahlen der ganzen Seite: oben
// Alterseinkommen und Kapitalleistungen je mit Zeitverlauf, darunter
// Rueckkaufswerte und Beitraege, zuletzt die offenen Punkte. Die anderen Tabs starten direkt mit
// ihren Vertraegen.
function renderUebersichtTab(today, offen) {
  const { renten, stufen, gesamt_cents: gesamt, ohne_beginn: ohneBeginn } = rentenStufen(data);
  const notizen = [];
  const gesetzlich = gesetzlicherRentenbeginn(data);
  const abGesetzlich = stufen.find((s) => s.datum === gesetzlich);
  if (abGesetzlich && abGesetzlich !== stufen.at(-1)) notizen.push(tf("vorsorge.kopf.abDatum", { datum: formatDate(abGesetzlich.datum), betrag: formatMoney(abGesetzlich.summe_cents) }));
  if (stufen.length) notizen.push(tf("vorsorge.kopf.vollAb", { datum: formatDate(stufen.at(-1).datum) }));
  if (ohneBeginn.length) notizen.push(tf("vorsorge.kopf.ohneBeginn", { n: ohneBeginn.length }));

  const mehrerePersonen = new Set(renten.map((l) => l.vorsorge.person_id)).size > 1;
  const sortiert = [...renten].sort((a, b) => b.wert_cents - a.wert_cents);
  const name = (l) => `${vorsorgeArtLabel(l.vorsorge.art)}${mehrerePersonen ? ` (${personName(l.vorsorge.person_id)})` : ""}`;
  const farben = vertragsFarben(data);
  const segmente = sortiert.map((l) => ({ anteil: l.wert_cents / Math.max(gesamt, 1), klasse: farbKlasse(farben, l.vorsorge.vorsorge_id), titel: `${name(l)}: ${formatMoney(l.wert_cents)}` }));
  const legende = sortiert.map((l) => `<span><i class="${farbKlasse(farben, l.vorsorge.vorsorge_id)}"></i>${escapeHtml(name(l))} ${escapeHtml(geldOhneCent(l.wert_cents))}</span>`).join("");

  const kapital = kapitalLeistungen(data, today);
  const vorsorgePositionen = modell.positionen;
  const rkw = vorsorgePositionen.reduce((a, p) => a + p.wert_cents, 0);
  const aktiv = (data.vorsorge ?? []).filter((vs) => !istBeendet(vs));
  const beitragVorsorge = aktiv.filter((vs) => tabFuerVorsorge(vs) !== "versicherungen").reduce((a, vs) => a + beitragJeMonatVertrag(data, vs.vorsorge_id, today), 0);
  const beitragVersicherung = aktiv.filter((vs) => tabFuerVorsorge(vs) === "versicherungen").reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0);

  const kz = (label, wert, notiz, zeilen = [], { grafik = "", unten = "" } = {}) => kennzahlKachel({ label, wert, notiz, zeilen, grafik, unten });
  const zeile = kachelZeile;
  const vertragLink = (id, name) => `<button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(id)}" title="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
  const tabLink = (tab, text) => `<button class="linkish" data-action="vorsorge-tab" data-tab="${escapeHtml(tab)}">${escapeHtml(text)}</button>`;

  // Faellig ist nur Terminiertes; bedingte (z. B. Todesfallsumme) und undatierte
  // Leistungen stehen darunter, ohne Jahr und ohne in die Summe einzugehen.
  // Ohne belegte Ablaufleistung zaehlt der heutige Rueckkaufswert (ersatz), markiert als "Stand heute".
  const kapitalZeile = (l, zusatz) => zeile(vertragLink(l.vorsorge.vorsorge_id, l.vorsorge.name), formatMoney(l.wert_cents), [zusatz, l.ersatz ? t("vorsorge.standHeute") : ""].filter(Boolean).join(" · "), farbKlasse(farben, l.vorsorge.vorsorge_id));
  const standHeute = kapital.terminiert.filter((l) => l.ersatz).reduce((a, l) => a + l.wert_cents, 0);
  const kapitalZeilen = [
    ...kapital.terminiert.map((l) => kapitalZeile(l, l.beginn.slice(0, 4))),
    ...kapital.bedingt.map((l) => kapitalZeile(l, t("vorsorge.kopf.bedingt"))),
    ...kapital.undatiert.map((l) => kapitalZeile(l, t("vorsorge.kopf.ohneTermin"))),
  ];
  const nichtFaellig = kapital.bedingt_cents + kapital.undatiert_cents;
  const kapitalNotiz = [
    kapital.jahre.length ? tf("vorsorge.kopf.kapitalFaellig", { jahre: kapital.jahre.join(", ") }) : "",
    standHeute ? tf("vorsorge.kopf.kapitalStandHeute", { betrag: formatMoney(standHeute) }) : "",
    nichtFaellig ? tf("vorsorge.kopf.nichtFaellig", { betrag: formatMoney(nichtFaellig) }) : "",
  ].filter(Boolean).join(" · ");
  const mitWert = vorsorgePositionen.filter((p) => !p.fehlt).sort((a, b) => b.wert_cents - a.wert_cents);
  const ohneWert = vorsorgePositionen.filter((p) => p.fehlt);
  const ohneWertTab = ohneWert.length ? tabFuerVorsorge((data.vorsorge ?? []).find((vs) => vs.vorsorge_id === ohneWert[0].id)) : null;
  const rkwZeilen = [
    ...mitWert.map((p) => zeile(vertragLink(p.id, p.name), formatMoney(p.wert_cents), "", farbKlasse(farben, p.id))),
    ...(ohneWert.length ? [`<li>${tabLink(ohneWertTab, tf("vorsorge.kopf.ohneWert", { n: ohneWert.length }))}<span class="amount muted">—</span></li>`] : []),
  ];
  const rkwDonut = donutDiagramm({ teile: mitWert.map((p) => ({ wert: p.wert_cents, klasse: farbKlasse(farben, p.id), label: p.name })), formatWert: formatMoney, ariaLabel: t("vorsorge.kopf.rkwAnteile") });
  // Beitraege je Tab; der Donut vergleicht Jahresbetraege, die Liste nennt den ueblichen Rhythmus.
  const beitragTabs = GRUPPEN_TABS
    .map((tab) => {
      const liste = vertraegeIm(tab).filter((vs) => !istBeendet(vs));
      return { tab, jahr: liste.reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0), monat: liste.reduce((a, vs) => a + beitragJeMonatVertrag(data, vs.vorsorge_id, today), 0) };
    })
    .filter((b) => b.jahr);
  const beitragZeilen = beitragTabs.map((b) => zeile(tabLink(b.tab, t(`vorsorge.tabs.${b.tab}`)),
    b.tab === "versicherungen" ? `${formatMoney(b.jahr)} ${t("vorsorge.jeJahr")}` : `${formatMoney(b.monat)} ${t("vorsorge.jeMonat")}`, "", `tab-farbe-${b.tab}`));
  const beitragDonut = donutDiagramm({ teile: beitragTabs.map((b) => ({ wert: b.jahr, klasse: `tab-farbe-${b.tab}`, label: tf("vorsorge.kopf.proJahr", { name: t(`vorsorge.tabs.${b.tab}`) }) })), formatWert: formatMoney, ariaLabel: t("vorsorge.kopf.beitragsAnteile") });

  const z = leistungsZeitstrahl(data, today);
  const renteUnten = `${zeitverlauf(z, "rente")}${renten.length ? `${balkenSvg(segmente)}<div class="vermoegen-legende">${legende}</div>` : ""}`;
  return `
    <div class="kachel-paare kachel-paare-oben">
      ${kz(t("vorsorge.kopf.alterseinkommen"), `${escapeHtml(formatMoney(gesamt))} ${einheit(t("vorsorge.jeMonatBrutto"))}`, escapeHtml(renten.length ? notizen.join(" · ") : t("vorsorge.kopf.keineRenten")), [], { unten: renteUnten })}
      ${kz(t("vorsorge.kopf.kapital"), escapeHtml(formatMoney(kapital.terminiert_cents)), escapeHtml(kapitalNotiz), kapitalZeilen, { unten: zeitverlauf(z, "kapital") })}
    </div>
    <div class="kachel-paare">
      ${kz(t("vorsorge.kopf.rueckkaufswerte"), escapeHtml(formatMoney(rkw)), escapeHtml(tf("vorsorge.kopf.bewertet", { mit: mitWert.length, gesamt: vorsorgePositionen.length })), rkwZeilen, { grafik: rkwDonut })}
      ${kz(t("vorsorge.kopf.beitraege"), `${escapeHtml(formatMoney(beitragVorsorge))} ${einheit(t("vorsorge.jeMonat"))}`, escapeHtml(tf("vorsorge.kopf.beitraegeNotiz", { betrag: formatMoney(beitragVersicherung) })), beitragZeilen, { grafik: beitragDonut })}
    </div>
    ${renderOffenePunkte(offen)}`;
}

// ------------------------------------------------------------- Tabs

// Kennzahl je Tab: erwartete Monatsrente, Rueckkaufswerte bzw. Jahresbeitraege.
function tabBetrag(tab, today) {
  const aktiv = vertraegeIm(tab).filter((vs) => !istBeendet(vs));
  const summeZeitwert = (feld) => aktiv.reduce((a, vs) => a + (zeitwert(vs, feld) ? cents(zeitwert(vs, feld).wert) : 0), 0);
  if (tab === "renten") return summeZeitwert("erwartete_rente");
  if (tab === "lebensversicherungen") return summeZeitwert("rueckkaufswert");
  return aktiv.reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0);
}

const tabUnter = (tab, today) => `${geldOhneCent(tabBetrag(tab, today))} ${t(`vorsorge.tabEinheit.${tab}`)}`;

function renderTabs(aktiv, today, offen) {
  const knopf = (tab) => {
    const liste = tab === "uebersicht" ? null : vertraegeIm(tab);
    if (liste && !liste.length) return "";
    const titel = liste ? `${liste.length} ${t(`vorsorge.tabs.${tab}`)}` : t("vorsorge.tabs.uebersicht");
    const unter = liste ? tabUnter(tab, today) : t("vorsorge.tabUebersichtUnter");
    const n = liste ? liste.filter((vs) => offen.has(vs.vorsorge_id)).length : 0;
    const punkt = n ? `<span class="tab-punkt" title="${escapeHtml(tf("vermoegen.offenAnzahl", { n }))}"></span>` : "";
    return `
      <button class="vermoegen-tab ${tab === aktiv ? "active" : ""}" role="tab" aria-selected="${tab === aktiv}" aria-controls="vorsorge-tab-${tab}" data-action="vorsorge-tab" data-tab="${tab}">
        <span class="vermoegen-tab-titel">${escapeHtml(titel)}${punkt}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(unter)}</span>
      </button>`;
  };
  return `<div class="vermoegen-tabs" role="tablist" aria-label="${escapeHtml(t("vorsorge.title"))}">${VORSORGE_TABS.map(knopf).join("")}</div>`;
}

// Zeitverlauf unter Alterseinkommen bzw. Kapitalleistungen: beide auf derselben
// Jahresachse, damit sie nebeneinander vergleichbar sind. Rente: Monatsrente je
// Jahr; Kapital: bis dahin ausgezahlt. Ein Marker je Jahr mit dem Zuwachs, sonst
// ueberlagern sich die Beschriftungen naher Termine.
function zeitverlauf(z, typ) {
  const leistungen = (z?.leistungen ?? []).filter((l) => l.typ === typ);
  if (!leistungen.length) return "";
  const jeJahr = new Map();
  for (const l of leistungen) {
    const jahr = Math.floor(l.pos);
    if (!jeJahr.has(jahr)) jeJahr.set(jahr, { pos: l.pos, summe: 0 });
    jeJahr.get(jahr).summe += l.wert_cents;
  }
  return zeitverlaufKlein({
    spalten: z.jahre.map((j) => ({ label: String(j), titel: String(j) })),
    serien: [{ klasse: `vorsorge-${typ}`, label: t(`vorsorge.zeitstrahl.${typ}`), werte: z[typ] }],
    ereignisse: [...jeJahr.values()].map((e) => ({ pos: e.pos, label: `+${geldOhneCent(e.summe)}` })),
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    ariaLabel: t(`vorsorge.zeitstrahl.titel.${typ}`),
  });
}

function renderOffenePunkte(offen) {
  const vertraege = (data.vorsorge ?? []).filter((vs) => offen.has(vs.vorsorge_id));
  const titel = `<h2 class="section-title">${escapeHtml(t("vorsorge.offen.titel"))}</h2>`;
  if (!vertraege.length) return `<p class="vorsorge-offen-keine"><span class="chip success">${iconSvg("success")}${escapeHtml(t("vorsorge.offen.keine"))}</span></p>`;
  // Ungepruefte Vertraege einer Person in einer Zeile, sonst je Vertrag und Check.
  const zeilen = [];
  const ungeprueft = new Map();
  for (const vs of vertraege) {
    for (const c of offen.get(vs.vorsorge_id)) {
      if (c.art === "vorsorge-ungeprueft") {
        if (!ungeprueft.has(vs.person_id)) ungeprueft.set(vs.person_id, []);
        ungeprueft.get(vs.person_id).push(vs);
      } else zeilen.push({ vs, titel: vs.name, text: t(`vermoegen.checkArt.${c.art}`), detail: c.text });
    }
  }
  for (const [personId, liste] of ungeprueft) {
    zeilen.push({
      vs: liste[0],
      titel: liste.length > 1 ? tf("vorsorge.offen.ungeprueftGruppe", { n: liste.length, person: personName(personId) }) : liste[0].name,
      text: t("vermoegen.checkArt.vorsorge-ungeprueft"),
      detail: liste.map((vs) => vs.name).join(", "),
    });
  }
  return `
    <section class="panel panel-pad vorsorge-offen">
      ${titel}
      <ul class="vorsorge-offen-liste">${zeilen.map((z) => `
        <li>
          <span>
            <button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(z.vs.vorsorge_id)}" title="${escapeHtml(z.detail)}">${escapeHtml(z.titel)}</button>
            <span class="muted">${escapeHtml(z.text)}</span>
          </span>
          <span class="chip review">${escapeHtml(t("vorsorge.offen.chip"))}</span>
        </li>`).join("")}
      </ul>
    </section>`;
}

// ------------------------------------------------------------- Tab je Vertragsart

function renderGruppenTab(tab, today, offen) {
  const alle = vertraegeIm(tab);
  const personen = [...new Set(alle.map((vs) => vs.person_id))].sort((a, b) => personName(a).localeCompare(personName(b)));
  const person = personen.includes(state.vorsorgeFilters?.person) ? state.vorsorgeFilters.person : "";
  const liste = alle.filter((vs) => !person || vs.person_id === person);
  const laufend = liste.filter((vs) => !istBeendet(vs) && vs.geprueft_am);
  const ungeprueft = liste.filter((vs) => !istBeendet(vs) && !vs.geprueft_am);
  const beendet = liste.filter(istBeendet);
  const reihenfolge = [...laufend, ...ungeprueft, ...beendet];
  const auswahl = reihenfolge.find((vs) => vs.vorsorge_id === state.selectedVorsorgeId) || reihenfolge[0] || null;

  const filter = personen.length > 1 ? `
    <div class="segment" role="group" aria-label="${escapeHtml(t("vorsorge.filterPerson"))}">
      ${[["", t("vorsorge.allePersonen"), alle.length], ...personen.map((p) => [p, personName(p), alle.filter((vs) => vs.person_id === p).length])].map(([p, name, n]) => `
        <button class="${person === p ? "active" : ""}" data-action="vorsorge-person" data-person="${escapeHtml(p)}" aria-pressed="${person === p}">${escapeHtml(name)} ${n}</button>`).join("")}
    </div>` : "";
  const farben = vertragsFarben(data);
  const karten = (vertraege) => `<div class="objekt-karten">${vertraege.map((vs) => renderKarte(vs, tab, vs === auswahl, today, offen, farben)).join("")}</div>`;
  const gruppe = (vertraege, titel, lead = "") => vertraege.length ? `
    <div class="vorsorge-gruppe-titel">${escapeHtml(titel)} (${vertraege.length})</div>
    ${lead ? `<p class="muted vorsorge-gruppe-lead">${escapeHtml(lead)}</p>` : ""}
    ${karten(vertraege)}` : "";

  return `
    <div class="vorsorge-tab-kopf"><span class="muted">${escapeHtml(tf("vorsorge.tabLead", { n: liste.length }))}</span>${filter}</div>
    ${tab === "versicherungen" ? renderBeitragsRanking(liste, today) : ""}
    ${laufend.length ? karten(laufend) : ""}
    ${gruppe(ungeprueft, t("vorsorge.gruppe.ungeprueft"), t("vorsorge.ungeprueftHinweis"))}
    ${gruppe(beendet, t("vorsorge.gruppe.beendet"))}
    ${auswahl ? renderDetail(auswahl, tab, today, offen) : `<section class="panel panel-pad"><p class="muted">${escapeHtml(t("vorsorge.noMatches"))}</p></section>`}`;
}

// Jahresbeitrag je Versicherung als Rangliste, dazu die Veraenderung zum Vorjahr:
// zeigt auf einen Blick, wo die Kosten liegen und wo sie gestiegen sind.
function renderBeitragsRanking(liste, today) {
  const zeilen = liste
    .filter((vs) => !istBeendet(vs))
    .map((vs) => ({ vs, jahr: beitragJeJahrVertrag(data, vs.vorsorge_id, today), vj: vertrag(vs).vorjahr }))
    .filter((z) => z.jahr > 0)
    .sort((a, b) => b.jahr - a.jahr || a.vs.vorsorge_id.localeCompare(b.vs.vorsorge_id));
  if (!zeilen.length) return "";
  const max = zeilen[0].jahr;
  const summe = zeilen.reduce((a, z) => a + z.jahr, 0);
  const inhalt = `
    <ul class="vorsorge-ranking">${zeilen.map(({ vs, jahr, vj }) => {
      const diff = vj?.vorjahr_cents ? vj.letzte_cents - vj.vorjahr_cents : null;
      const chip = diff ? `<span class="chip ${diff > 0 ? "review" : "success"}" title="${escapeHtml(`${formatMoney(vj.vorjahr_cents)} → ${formatMoney(vj.letzte_cents)}`)}">${escapeHtml(veraenderungText(vj))}</span>` : `<span class="muted">${diff === 0 ? "±0 %" : "—"}</span>`;
      return `
      <li>
        <button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(vs.vorsorge_id)}" title="${escapeHtml(vs.name)}">${mitLogo({ vorsorge: vs }, escapeHtml(vs.name), { groesse: "vergleich" })}</button>
        <svg class="ranking-balken" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="1" width="${(jahr / max * 100).toFixed(2)}" height="8" rx="1.5" class="ranking-wert" /></svg>
        <span class="amount">${escapeHtml(formatMoney(jahr))}</span>
        <span class="ranking-aenderung">${chip}</span>
      </li>`;
    }).join("")}
    </ul>
    <p class="muted diagramm-lead">${escapeHtml(tf("vorsorge.ranking.lead", { betrag: formatMoney(summe) }))}</p>`;
  return klappKachel({ id: "vorsorge.ranking", titel: t("vorsorge.ranking.titel"), inhalt, offen: false, klasse: "vorsorge-ranking-kachel" });
}

function renderKarte(vs, tab, aktiv, today, offen, farben = new Map()) {
  const rente = zeitwert(vs, "erwartete_rente");
  const rkw = zeitwert(vs, "rueckkaufswert");
  const kapital = zeitwert(vs, "erwartete_kapitalleistung");
  const vertragswert = zeitwert(vs, "vertragswert");
  const fehlt = `<span class="chip review">${escapeHtml(t("vorsorge.keinWert"))}</span>`;
  const beginn = vs.leistung_beginn ? tf("vorsorge.karte.leistungAb", { datum: formatDate(vs.leistung_beginn) }) : "";
  const zeilen = [];
  let wert;
  let fortschritt = null;
  if (tab === "versicherungen") {
    const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
    wert = jahr ? `${escapeHtml(formatMoney(jahr))} ${einheit(t("vorsorge.jeJahr"))}` : `<span class="muted">—</span>`;
    const naechster = naechsterBeitrag(data, vs.vorsorge_id, today);
    zeilen.push([personName(vs.person_id), naechster ? tf("vorsorge.karte.faellig", { datum: formatDate(naechster.datum) }) : ""].filter(Boolean).join(" · "));
    const vj = vertrag(vs).vorjahr;
    if (vj?.vorjahr_cents) zeilen.push(`${tf("vorsorge.karte.vorjahr", { betrag: formatMoney(vj.vorjahr_cents) })} · ${veraenderungText(vj)}`);
    if (rkw) zeilen.push(`${rkwLabel(vs)} ${formatMoney(cents(rkw.wert))}${vs.kapitalbildend ? "" : ` · ${t("vorsorge.nichtImVermoegen")}`}`);
  } else if (tab === "renten") {
    // Hauptwert ist die Rente; ohne Rente der Rueckkaufs- bzw. Vertragswert.
    const ersatz = rkw || vertragswert;
    wert = rente ? `${escapeHtml(formatMoney(cents(rente.wert)))} ${einheit(t("vorsorge.jeMonat"))}` : ersatz ? escapeHtml(formatMoney(cents(ersatz.wert))) : fehlt;
    zeilen.push([personName(vs.person_id), beginn].filter(Boolean).join(" · "));
    if (rente && rkw) zeilen.push(`${rkwLabel(vs)} ${formatMoney(cents(rkw.wert))}${vs.kapitalbildend ? "" : ` · ${t("vorsorge.nichtImVermoegen")}`}`);
    else if (rente && vertragswert) zeilen.push(`${t("vorsorge.vertragswert")} ${formatMoney(cents(vertragswert.wert))} · ${t("vorsorge.nichtImVermoegen")}`);
    else if (!rente && !rkw && vertragswert) zeilen.push(`${t("vorsorge.vertragswert")} · ${t("vorsorge.nichtImVermoegen")}`);
    if (istRiester(vs)) zeilen.push(riesterHinweis(vs));
  } else {
    wert = rkw ? escapeHtml(formatMoney(cents(rkw.wert))) : fehlt;
    zeilen.push([personName(vs.person_id), beginn].filter(Boolean).join(" · "));
    if (kapital) zeilen.push(tf("vorsorge.karte.kapital", { betrag: formatMoney(cents(kapital.wert)) }));
    if (rkw && kapital && cents(kapital.wert) > 0) {
      const anteil = Math.min(1, cents(rkw.wert) / cents(kapital.wert));
      fortschritt = { anteil, text: tf("vorsorge.karte.fortschritt", { prozent: `${Math.round(anteil * 100)} %` }) };
    }
    else {
      const beitrag = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
      if (beitrag) zeilen.push(`${t("vorsorge.beitrag")} ${formatMoney(beitrag)} ${t("vorsorge.jeMonat")}`);
    }
  }
  // Was im Todesfall fliesst, steht auf jeder Karte, die den Wert kennt.
  const todesfall = zeitwert(vs, "todesfallleistung");
  if (todesfall) zeilen.push(tf("vorsorge.karte.todesfall", { betrag: formatMoney(cents(todesfall.wert)) }));
  const checks = offen.get(vs.vorsorge_id) ?? [];
  const chips = [
    vs.status !== "aktiv" ? statusChip(vs) : "",
    !vs.geprueft_am && !istBeendet(vs) ? `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>` : "",
    checks.some((c) => c.art === "vorsorge-wiedervorlage") ? `<span class="chip review">${escapeHtml(t("vorsorge.wiedervorlage"))}</span>` : "",
    checks.some((c) => c.art === "vorsorge-wechsel") ? `<span class="chip review">${escapeHtml(t("vermoegen.checkArt.vorsorge-wechsel"))}</span>` : "",
    dynamikChip(vs, today),
    vs.kapitalbildend ? `<span class="chip kapitalbildend">${escapeHtml(t("vorsorge.kapitalbildend"))}</span>` : "",
  ].join("");
  const bezug = bezugLinks(vs);
  // Kein <button>: die Karte enthaelt mit dem Bezug einen eigenen Link.
  return `
    <div class="objekt-karte ${aktiv ? "active" : ""} ${vs.geprueft_am || istBeendet(vs) ? "" : "objekt-karte-ungeprueft"}" role="button" tabindex="0" data-action="select-vorsorge" data-vorsorge="${escapeHtml(vs.vorsorge_id)}" aria-pressed="${aktiv}">
      <span class="objekt-karte-kopf"><span class="objekt-karte-titel"><strong>${farben.has(vs.vorsorge_id) ? farbPunkt(farbKlasse(farben, vs.vorsorge_id)) : ""}${escapeHtml(vs.name)}</strong>${vs.versicherungsnummer ? `<span class="objekt-karte-nummer">${escapeHtml(vs.versicherungsnummer)}</span>` : ""}</span><span class="objekt-karte-marke">${kachelEtikett(vs, tab) ? `<span class="chip neutral">${escapeHtml(kachelEtikett(vs, tab))}</span>` : ""}${logoMarke({ vorsorge: vs })}</span></span>
      <span class="objekt-karte-wert">${wert}</span>
      ${fortschritt ? `${balkenSvg([{ anteil: fortschritt.anteil, klasse: "fortschritt-wert", titel: fortschritt.text }], { klasse: "fortschritt" })}<span class="objekt-karte-zeile">${escapeHtml(fortschritt.text)}</span>` : ""}
      ${zeilen.filter(Boolean).map((z) => `<span class="objekt-karte-zeile">${escapeHtml(z)}</span>`).join("")}
      ${bezug.length ? `<span class="objekt-karte-zeile objekt-karte-bezug">${iconSvg("vermoegen")}${escapeHtml(t("vorsorge.gehoertZu"))} ${bezug.join(", ")}</span>` : ""}
      <span class="objekt-karte-fuss">${chips ? `<span class="objekt-karte-chips">${chips}</span>` : ""}<span class="objekt-karte-id">${escapeHtml(vs.vorsorge_id)}</span></span>
    </div>`;
}

// "+3,40 € (+3,5 %)" bzw. "−2,00 € (−1,8 %)".
function aenderungText(a) {
  const vorzeichen = a.diff_cents > 0 ? "+" : "−";
  const prozent = a.anteil === null ? "" : ` (${vorzeichen}${fmt().zahl(Math.abs(a.anteil) * 100, 1)} %)`;
  return `${vorzeichen}${formatMoney(Math.abs(a.diff_cents))}${prozent}`;
}

function veraenderungText(vj) {
  const diff = vj.letzte_cents - vj.vorjahr_cents;
  const prozent = vj.vorjahr_cents ? Math.round((diff / vj.vorjahr_cents) * 100) : 0;
  return `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(prozent)} %`;
}

function statusChip(vs) {
  const className = vs.status === "aktiv" ? "success" : istBeendet(vs) ? "review" : "neutral";
  return `<span class="chip ${className}">${escapeHtml(statusLabel(vs.status))}</span>`;
}

// ------------------------------------------------------------- Detail in voller Breite

function renderDetail(vs, tab, today, offen) {
  return `
    <div class="objekt-detail-titel">
      <span class="muted">${escapeHtml(t("vermoegen.detailVon"))}</span>
      <h2 class="section-title">${escapeHtml(vs.name)}</h2>
    </div>
    <div class="objekt-detail">
      ${kennzahlRaster(vs, tab, today)}
      ${renderVertragsdaten(vs, tab, offen)}
      ${renderDokumente(vs)}
      ${renderBeitraege(vs)}
      ${renderAnhang(vs)}
    </div>`;
}

function zeitwertNotiz(zw) {
  return `${qualitaetChip({ qualitaet: zw.qualitaet })} ${escapeHtml(formatDate(zw.standdatum))}`;
}

function kennzahlenVorsorge(vs, today) {
  const rkw = zeitwert(vs, "rueckkaufswert");
  const vertragswert = zeitwert(vs, "vertragswert");
  const rente = zeitwert(vs, "erwartete_rente");
  const kapitalAblauf = kapitalZumAblauf(data, vs);
  const kapital = kapitalAblauf?.zeitwert;

  let wert;
  if (rkw) {
    const zusatz = vertragswert ? ` · ${escapeHtml(t("vorsorge.vertragswert"))} ${escapeHtml(geldOhneCent(cents(vertragswert.wert)))}` : "";
    const nicht = vs.kapitalbildend ? "" : ` · ${escapeHtml(t("vorsorge.nichtImVermoegen"))}`;
    const gebunden = istRiester(vs) ? `<br>${escapeHtml(t("vorsorge.riester.nurBeiKuendigung"))}` : "";
    wert = kennzahl(rkwLabel(vs), geld(cents(rkw.wert)), zeitwertNotiz(rkw) + nicht + zusatz + gebunden);
  } else if (vertragswert) {
    wert = kennzahl(t("vorsorge.vertragswert"), geld(cents(vertragswert.wert)), `${escapeHtml(formatDate(vertragswert.standdatum))} · ${escapeHtml(t("vorsorge.nichtImVermoegen"))}`);
  } else if (vs.kapitalbildend) {
    wert = kennzahl(t("vorsorge.rueckkaufswert"), `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`, escapeHtml(t("vorsorge.nochNichtImVermoegen")));
  } else {
    wert = kennzahl(t("vorsorge.wert"), `<span class="muted">${escapeHtml(t("vorsorge.anwartschaftKurz"))}</span>`, escapeHtml(t("vorsorge.nichtImVermoegen")));
  }

  const leistung = rente
    ? kennzahl(t("vorsorge.erwarteteRente"), `${geld(cents(rente.wert))} ${einheit(t("vorsorge.jeMonat"))}`, zeitwertNotiz(rente) + (istRiester(vs) ? `<br>${escapeHtml(riesterHinweis(vs))}` : ""))
    : kapital
      ? kennzahl(t("vorsorge.kapitalBeiAblauf"), geld(cents(kapital.wert)), kapitalAblauf.ersatz ? `${escapeHtml(t("vorsorge.kapitalStandHeute"))} · ${escapeHtml(formatDate(kapital.standdatum))}` : zeitwertNotiz(kapital))
      : kennzahl(t("vorsorge.erwarteteLeistung"), `<span class="muted">—</span>`, escapeHtml(t("vorsorge.keineLeistung")));

  let beginnNotiz = "";
  if (vs.leistung_beginn) {
    const monate = monateBis(today, vs.leistung_beginn);
    const teile = [monate > 0 ? tf("vorsorge.inJahrenMonaten", { j: Math.floor(monate / 12), m: monate % 12 }) : t("vorsorge.laeuft")];
    const gesetzlich = vs.art === "gesetzliche-rente" ? null : gesetzlicherRentenbeginn(data, vs.person_id);
    if (gesetzlich) {
      const abstand = monateBis(gesetzlich, vs.leistung_beginn);
      teile.push(abstand === 0 ? t("vorsorge.mitGesetzlicherRente") : tf(abstand < 0 ? "vorsorge.vorGesetzlicherRente" : "vorsorge.nachGesetzlicherRente", { m: Math.abs(abstand) }));
    }
    beginnNotiz = escapeHtml(teile.join(" · "));
  }
  const beginn = kennzahl(t("vorsorge.leistungBeginn"), vs.leistung_beginn ? escapeHtml(formatDate(vs.leistung_beginn)) : `<span class="muted">—</span>`, vs.leistung_beginn ? beginnNotiz : escapeHtml(t("vorsorge.nichtHinterlegt")));

  const monat = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
  const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
  const jaehrlich = jaehrlichGezahlt(vs, today);
  const letzte = vertrag(vs).letzte_aenderung;
  const beitragNotiz = [
    jaehrlich ? `${formatMoney(monat)} ${t("vorsorge.jeMonat")}` : `${formatMoney(jahr)} ${t("vorsorge.jeJahr")}`,
    letzte ? tf("vorsorge.zuletztAenderung", { aenderung: aenderungText(letzte), datum: formatDate(letzte.datum) }) : "",
  ].filter(Boolean).join(" · ");
  const beitrag = jahr
    ? kennzahl(t("vorsorge.beitrag"), jaehrlich ? `${geld(jahr)} ${einheit(t("vorsorge.jeJahr"))}` : `${geld(monat)} ${einheit(t("vorsorge.jeMonat"))}`, escapeHtml(beitragNotiz))
    : kennzahl(t("vorsorge.beitrag"), `<span class="muted">—</span>`, escapeHtml(t("vorsorge.keinBeitrag")));
  return wert + leistung + beginn + beitrag;
}

function kennzahlenVersicherung(vs, today) {
  // Manche Schutzvertraege (z. B. Pflegeversicherung mit Sparanteil) weisen einen Rueckkaufswert aus.
  const rkw = zeitwert(vs, "rueckkaufswert");
  const monat = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
  const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
  const naechster = naechsterBeitrag(data, vs.vorsorge_id, today);
  const vj = vertrag(vs).vorjahr;
  const konto = naechster?.regelzahlung.konto_id ? (kontenById.get(naechster.regelzahlung.konto_id)?.name || naechster.regelzahlung.konto_id) : "";
  let veraenderung;
  if (vj?.vorjahr_cents) {
    const diff = vj.letzte_cents - vj.vorjahr_cents;
    veraenderung = kennzahl(t("vorsorge.veraenderungVorjahr"), `<span class="${diff > 0 ? "betrag-negativ" : ""}">${diff > 0 ? "+" : ""}${escapeHtml(formatMoney(diff))}</span>`,
      escapeHtml(`${veraenderungText(vj)} · ${formatDate(vj.vorjahr_datum)}: ${formatMoney(vj.vorjahr_cents)} → ${formatDate(vj.letzte_datum)}: ${formatMoney(vj.letzte_cents)}`));
  } else {
    veraenderung = kennzahl(t("vorsorge.veraenderungVorjahr"), `<span class="muted">—</span>`, escapeHtml(t(vj ? "vorsorge.nurEineBuchung" : "vorsorge.keineBuchung")));
  }
  return kennzahl(t("vorsorge.jahresbeitrag"), jahr ? geld(jahr) : `<span class="muted">—</span>`, jahr ? escapeHtml(`${formatMoney(monat)} ${t("vorsorge.jeMonatUmgelegt")}`) : escapeHtml(t("vorsorge.keinBeitrag")))
    + kennzahl(t("vorsorge.naechsteFaelligkeit"), naechster ? escapeHtml(formatDate(naechster.datum)) : `<span class="muted">—</span>`, konto ? escapeHtml(tf("vorsorge.lastschriftVon", { konto })) : "")
    + veraenderung
    + (rkw
      ? kennzahl(t("vorsorge.rueckkaufswert"), geld(cents(rkw.wert)), zeitwertNotiz(rkw) + (vs.kapitalbildend ? "" : ` · ${escapeHtml(t("vorsorge.nichtImVermoegen"))}`))
      : kennzahl(t("vorsorge.geprueftAm"), vs.geprueft_am ? escapeHtml(formatDate(vs.geprueft_am)) : `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>`, ""));
}

// Beitragsbefreiung als Haekchen (nur Anzeige; gesetzt wird sie aus dem Beleg).
const BEFREIUNG_FAELLE = ["bu", "arbeitslosigkeit"];
function beitragsbefreiungHtml(vs) {
  return `<span class="befreiung-liste">${BEFREIUNG_FAELLE.map((fall) => {
    const an = (vs.beitragsbefreiung ?? []).includes(fall);
    return `<label class="befreiung"><input type="checkbox" disabled${an ? " checked" : ""}> ${escapeHtml(t(`vorsorge.beitragsbefreiung.${fall}`))}</label>`;
  }).join("")}</span>`;
}

function renderVertragsdaten(vs, tab, offen) {
  const vorgaenger = vs.ersetzt_vorsorge_id ? (data.vorsorge ?? []).find((v) => v.vorsorge_id === vs.ersetzt_vorsorge_id) : null;
  const nachfolger = (data.vorsorge ?? []).find((v) => v.ersetzt_vorsorge_id === vs.vorsorge_id);
  const verweis = (v) => `<button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(v.vorsorge_id)}">${escapeHtml(`${v.vorsorge_id} · ${v.name}`)}</button>`;
  const beitraege = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vs.vorsorge_id);
  const beitragZeilen = beitraege.map((rz) => `<div><button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}">${escapeHtml(`${rz.regelzahlung_id} · ${rz.bezeichnung}`)}</button> <span class="muted">${escapeHtml(`${formatMoney(cents(rz.betrag))} · ${rhythmusLabel(rz.rhythmus_einheit, rz.rhythmus_intervall)}${rz.aktiv_bis ? ` · ${t("vorsorge.aktivBis")} ${formatDate(rz.aktiv_bis)}` : ""}`)}</span></div>`).join("");
  const wiedervorlage = (offen.get(vs.vorsorge_id) ?? []).some((c) => c.art === "vorsorge-wiedervorlage");
  const fristen = fristenText("vorsorge", vs.vorsorge_id);
  const quelle = [vs.quelle_hinweis ? quelleHtml(vs.quelle_hinweis) : "", vs.quelle_standdatum ? escapeHtml(formatDate(vs.quelle_standdatum)) : ""].filter(Boolean).join(" · ");
  return kachel("vertragsdaten", t("vorsorge.vertragsdaten"), `
      <div class="vertragsdaten-mit-logo">
      <div class="stammdaten-raster">
        ${detailRow(t("labels.id"), escapeHtml(vs.vorsorge_id))}
        ${detailRow(t("labels.type"), escapeHtml(vorsorgeArtLabel(vs.art)))}
        ${vs.versicherungsnummer ? detailRow(t("vorsorge.versicherungsnummer"), escapeHtml(vs.versicherungsnummer)) : ""}
        ${vs.sparte ? detailRow(t("vorsorge.sparteLabel"), escapeHtml(sparteLabel(vs.sparte))) : ""}
        ${detailRow(t("labels.owner"), escapeHtml(personName(vs.person_id)))}
        ${detailRow(t("labels.status"), statusChip(vs))}
        ${tab === "versicherungen" && !vs.kapitalbildend ? "" : detailRow(t("vorsorge.kapitalbildendLabel"), escapeHtml(vs.kapitalbildend ? t("labels.yes") : t("labels.no")))}
        ${vs.kapitalwahl ? detailRow(t("vorsorge.kapitalwahl"), escapeHtml(istRiester(vs) ? `${vs.kapitalwahl} · ${riesterHinweis(vs)}` : vs.kapitalwahl)) : ""}
        ${vs.aktiv_bis ? detailRow(t("vorsorge.aktivBis"), escapeHtml(formatDate(vs.aktiv_bis))) : ""}
        ${beitraege.length || vs.beitragsbefreiung ? detailRow(t("vorsorge.beitragsbefreiung.titel"), beitragsbefreiungHtml(vs)) : ""}
        ${fristen ? detailRow(t("vermoegen.fristen"), fristen) : ""}
        ${detailRow(t("vorsorge.geprueftAm"), vs.geprueft_am
          ? `${escapeHtml(formatDate(vs.geprueft_am))}${wiedervorlage ? ` <span class="chip review">${escapeHtml(t("vorsorge.wiedervorlage"))}</span>` : ""}`
          : `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>`)}
        ${bezugLinks(vs).length ? detailRow(t("vorsorge.gehoertZu"), bezugLinks(vs).join("<br>")) : ""}
        ${vorgaenger ? detailRow(t("vorsorge.vorgaenger"), verweis(vorgaenger)) : ""}
        ${nachfolger ? detailRow(t("vorsorge.nachfolger"), verweis(nachfolger)) : ""}
      </div>
      ${logoMarke({ vorsorge: vs })}
      </div>
      ${quelle || beitraege.length ? `
        <div class="vorsorge-spalten">
          <div>${quelle ? detailRow(t("vorsorge.vertragsquelle"), quelle) : ""}</div>
          <div>${beitraege.length ? detailRow(t("vorsorge.erwarteteBeitraege"), beitragZeilen) : ""}</div>
        </div>` : ""}`);
}

// Oberer Teil der Kachel "Beitraege und Wertentwicklung": links der Wert gegen
// das Eingezahlte, rechts vier Kennzahlen 2x2, damit die Kachel flach bleibt.
const mitVorzeichen = (c) => `${c > 0 ? "+" : ""}${formatMoney(c)}`;

function wertEntwicklungHtml(vs, we, link) {
  const { letzter, ertrag, feld } = we;
  const wertLabel = feld === "rueckkaufswert" ? rkwLabel(vs) : t("vorsorge.vertragswert");
  // Gestrichelt: mit Beitragssumme das Eingezahlte, sonst der Wert ohne Ertrag
  // (erster abgedeckter Stand plus Beitraege seither), so weit die Buchungen reichen.
  const mitSumme = we.punkte.some((p) => p.vollstaendig);
  const vergleich = new Map(mitSumme
    ? we.punkte.filter((p) => p.vollstaendig).map((p) => [p.datum, p.eingezahlt_cents])
    : we.ohne_ertrag.map((p) => [p.datum, p.cents]));
  const eingezahltLabel = t(mitSumme ? "vorsorge.wertentwicklung.eingezahlt" : "vorsorge.wertentwicklung.ohneErtrag");
  const ertragJeDatum = new Map(we.zeitraeume.map((z) => [z.bis, z.ertrag_cents]));
  const svg = wertVerlauf({
    punkte: we.punkte.map((p) => ({ datum: p.datum, wert_cents: p.wert_cents, eingezahlt_cents: vergleich.get(p.datum) ?? null, ertrag_cents: ertragJeDatum.get(p.datum) ?? null })),
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    formatDatum: formatDate,
    labels: { wert: wertLabel, eingezahlt: eingezahltLabel, ertrag: t("vorsorge.wertentwicklung.ertragSeitVorstand") },
    ariaLabel: t("vorsorge.wertentwicklung.lead"),
  });
  const diagramm = svg
    ? `<p class="muted diagramm-lead">${escapeHtml(t("vorsorge.wertentwicklung.lead"))}</p>
      <div class="diagramm-legende-html"><span class="swatch wert"></span>${escapeHtml(wertLabel)}${vergleich.size > 1 ? `<span class="swatch eingezahlt"></span>${escapeHtml(eingezahltLabel)}` : ""}</div>
      <div class="diagramm-wrap">${svg}</div>`
    : `<p class="muted">${escapeHtml(t("vorsorge.wertentwicklung.einStand"))}</p>`;
  const betrag = (c) => `<span class="${c < 0 ? "betrag-negativ" : ""}">${escapeHtml(mitVorzeichen(c))}</span>`;
  const ertragKachel = ertrag
    ? kennzahl(tf("vorsorge.wertentwicklung.ertrag", { von: ertrag.von.slice(0, 4), bis: ertrag.bis.slice(0, 4) }), betrag(ertrag.ertrag_cents),
      escapeHtml(tf("vorsorge.wertentwicklung.ertragNotiz", { zuwachs: mitVorzeichen(ertrag.zuwachs_cents), beitraege: formatMoney(ertrag.beitraege_cents) })))
    : kennzahl(t("vorsorge.wertentwicklung.ertragFehlt"), geld(null), escapeHtml(t("vorsorge.wertentwicklung.ertragFehltNotiz")));
  const wertKachel = kennzahl(wertLabel, geld(letzter.wert_cents), escapeHtml(formatDate(letzter.datum)));
  let kennzahlen;
  if (letzter.vollstaendig) {
    // Mit Beitragssumme: Wert gegen alles seit Vertragsbeginn Eingezahlte.
    const differenz = letzter.wert_cents - letzter.eingezahlt_cents;
    kennzahlen = [
      wertKachel,
      kennzahl(t("vorsorge.wertentwicklung.eingezahlt"), geld(letzter.eingezahlt_cents), escapeHtml(tf("vorsorge.wertentwicklung.eingezahltLaut", { datum: formatDate(letzter.datum) }))),
      letzter.eingezahlt_cents > 0
        ? kennzahl(t("vorsorge.wertentwicklung.differenz"), betrag(differenz), escapeHtml(tf("vorsorge.wertentwicklung.anteil", { prozent: prozent(letzter.wert_cents / letzter.eingezahlt_cents) })))
        : kennzahl(t("vorsorge.wertentwicklung.differenz"), geld(null), escapeHtml(t("vorsorge.wertentwicklung.differenzFehlt"))),
      ertragKachel,
    ];
  } else {
    // Ohne Beitragssumme ist das Eingezahlte unbekannt; aussagekraeftig ist dann
    // der Ertrag seit dem ersten Stand, ab dem die Buchungen reichen.
    const start = we.ohne_ertrag[0];
    const ende = we.ohne_ertrag.at(-1);
    kennzahlen = [wertKachel];
    if (we.ohne_ertrag.length > 1) {
      kennzahlen.push(kennzahl(tf("vorsorge.wertentwicklung.ertragSeit", { datum: formatDate(start.datum) }), betrag(letzter.wert_cents - ende.cents),
        escapeHtml(tf("vorsorge.wertentwicklung.ertragSeitNotiz", { zuwachs: mitVorzeichen(letzter.wert_cents - start.cents), beitraege: formatMoney(ende.cents - start.cents) }))));
    }
    kennzahlen.push(ertragKachel);
  }
  return `
    <div class="vorsorge-spalten vorsorge-spalten-breit wert-entwicklung">
      <div>${diagramm}</div>
      <div><div class="kennzahl-raster wert-kennzahlen">${kennzahlen.join("")}</div>${link}</div>
    </div>`;
}

// Beitraege selbst stehen in den gefilterten Transaktionen; die Kachel verlinkt
// nur dorthin und zeigt, wenn es Wertstaende gibt, die Wertentwicklung.
function renderBeitraege(vs) {
  const we = vertrag(vs).wert_entwicklung;
  const titel = t(we ? "vorsorge.wertentwicklung.titel" : "vorsorge.gebuchteBeitraege");
  const anzahl = vertrag(vs).anzahl_buchungen;
  const hatRegelzahlung = (data.regelzahlungen ?? []).some((rz) => rz.vorsorge_id === vs.vorsorge_id);
  const link = anzahl
    ? `<p class="wert-buchungen-link"><button class="linkish" data-action="vorsorge-transactions" data-vorsorge="${escapeHtml(vs.vorsorge_id)}">${escapeHtml(tf("vorsorge.alleBuchungen", { n: anzahl }))} →</button></p>`
    : `<p class="muted">${escapeHtml(t(hatRegelzahlung ? "vorsorge.keineBuchung" : "vorsorge.keinBeitrag"))}</p>`;
  return kachel("beitraege", titel, we ? wertEntwicklungHtml(vs, we, link) : link);
}

const FELD_LABEL = {
  rueckkaufswert: "vorsorge.rueckkaufswert",
  vertragswert: "vorsorge.vertragswert",
  erwartete_rente: "vorsorge.erwarteteRente",
  erwartete_kapitalleistung: "vorsorge.erwarteteKapitalleistung",
  bu_rente: "vorsorge.buRente",
  erwerbsminderungsrente: "vorsorge.erwerbsminderungsrente",
  todesfallleistung: "vorsorge.todesfallleistung",
  hinterbliebenenrente: "vorsorge.hinterbliebenenrente",
  beitragssumme: "vorsorge.beitragssumme",
};

// Dokumente als eigene Kachel direkt unter den Kennzahlen und Vertragsdaten.
// Widerspruchsfristen des Vertrags aus der Fristenliste, je mit der Frage, ob
// fuer den zugehoerigen Erhoehungstermin widersprochen werden muss.
function widerspruchsFristen(vs, today, stand) {
  return fristenZuObjekt(data, today, "vorsorge", vs.vorsorge_id)
    .filter((f) => f.art === "widerspruch")
    .map((f) => ({ ...f, bedarf: widerspruchFuerFrist(stand, f.datum) }));
}

// Hinweis auf der Vertragskarte: ein faelliger Widerspruch geht vor, sonst eine
// anstehende Dynamik-Entscheidung.
function dynamikChip(vs, today) {
  const d = dynamikStand(vs, today);
  if (!d) return "";
  const widerspruch = widerspruchsFristen(vs, today, d).find((f) => f.bedarf?.noetig && (f.bald || f.ueberfaellig));
  if (widerspruch) {
    return `<span class="chip review" title="${escapeHtml(widerspruch.bezeichnung)}">${escapeHtml(tf("vorsorge.dynamik.widerspruchBis", { datum: formatDate(widerspruch.datum) }))}</span>`;
  }
  if (!d.entscheidung_noetig) return "";
  const text = t(`vorsorge.dynamik.chip.${d.vorschlag ?? "offen"}`);
  const titel = tf("vorsorge.dynamik.naechste", { datum: formatDate(d.naechster_termin) });
  return `<span class="chip review" title="${escapeHtml(titel)}">${escapeHtml(text)}</span>`;
}

// Naechster Schritt bei der Beitragsdynamik: ein offener Widerspruch geht vor,
// sonst die Entscheidung zum naechsten Erhoehungstermin.
function dynamikAktion(vs, today) {
  const d = dynamikStand(vs, today);
  if (!d) return null;
  if (d.erloschen) return { d, aktion: "erloschen" };
  const widerspruch = widerspruchsFristen(vs, today, d).find((f) => f.bedarf?.noetig);
  if (widerspruch) return { d, aktion: "widersprechen", frist: widerspruch };
  return { d, aktion: d.vorschlag ?? "offen" };
}

const VERLAUF_ZEICHEN = { angenommen: "✓", abgelehnt: "✗" };

// Kleine Kachel "Beitragsdynamik" im Kennzahl-Raster: was als Naechstes zu tun
// ist, bis wann, und die letzten drei Entscheidungen. Die Begruendung steht im Tooltip.
function dynamikKennzahl(vs, today) {
  const a = dynamikAktion(vs, today);
  if (!a) return "";
  const { d } = a;
  let notiz;
  if (a.aktion === "erloschen") notiz = tf("vorsorge.dynamik.notiz.erloschen", { n: d.ablehnungen_in_folge });
  else if (a.aktion === "widersprechen") {
    notiz = tf("vorsorge.dynamik.notiz.widersprechen", { datum: formatDate(a.frist.datum), termin: formatDate(a.frist.bedarf.termin) })
      + (a.frist.bedarf.vorgeschlagen ? ` · ${t("vorsorge.dynamik.notiz.nachRegel")}` : "");
  } else {
    notiz = tf("vorsorge.dynamik.notiz.zum", { datum: formatDate(d.naechster_termin) })
      + ` · ${t(a.aktion === "offen" ? "vorsorge.dynamik.notiz.unvollstaendig" : "vorsorge.dynamik.notiz.nachRegel")}`;
  }
  const chance = d.letzte_chance && a.aktion === "annehmen" ? ` <span class="chip review">${escapeHtml(t("vorsorge.dynamik.letzteChance"))}</span>` : "";
  const verlauf = d.verlauf.filter((v) => VERLAUF_ZEICHEN[v.entscheidung]).slice(-3)
    .map((v) => `${v.termin.slice(0, 4)} ${VERLAUF_ZEICHEN[v.entscheidung]}`).join(" · ");
  const titel = [tf(`vorsorge.dynamik.grund.${d.grund}`, { n: d.ablehnungen_in_folge }), tf("vorsorge.dynamik.erlischt", { n: d.erlischt_nach, folge: d.ablehnungen_in_folge })].join(" ");
  return kennzahl(t("vorsorge.dynamik.titel"), escapeHtml(t(`vorsorge.dynamik.aktion.${a.aktion}`)),
    `${escapeHtml(notiz)}${chance}${verlauf ? `<br>${escapeHtml(verlauf)}` : ""}`, { titel });
}

// Kachel "Absicherung": was bei BU oder Tod fliesst (Zeitwerte, nur Anzeige).
// Der erste vorhandene Wert ist die Hauptzahl, die uebrigen stehen darunter.
const ABSICHERUNG_FELDER = [
  ["bu_rente", true],
  ["erwerbsminderungsrente", true],
  ["todesfallleistung", false],
  ["hinterbliebenenrente", true],
];

function absicherungKennzahl(vs) {
  const werte = ABSICHERUNG_FELDER.map(([feld, monatlich]) => ({ feld, monatlich, zw: zeitwert(vs, feld) })).filter((w) => w.zw);
  if (!werte.length) return "";
  const [haupt, ...rest] = werte;
  const betrag = (w) => `${geld(cents(w.zw.wert))}${w.monatlich ? ` ${einheit(t("vorsorge.jeMonat"))}` : ""}`;
  const weitere = rest.map((w) => `<br>${escapeHtml(t(FELD_LABEL[w.feld]))} ${escapeHtml(formatMoney(cents(w.zw.wert)))}${w.monatlich ? ` ${escapeHtml(t("vorsorge.jeMonat"))}` : ""}`).join("");
  return kennzahl(t("vorsorge.absicherung"), betrag(haupt), `${escapeHtml(t(FELD_LABEL[haupt.feld]))} · ${zeitwertNotiz(haupt.zw)}${weitere}`);
}

// Kennzahlen im Vertragsdetail: vier Grundkacheln, dazu Absicherung und
// Beitragsdynamik, wenn vorhanden (fuenf in einer Reihe, sechs in zwei).
function kennzahlRaster(vs, tab, today) {
  const extra = [absicherungKennzahl(vs), dynamikKennzahl(vs, today)].filter(Boolean);
  const basis = tab === "versicherungen" ? kennzahlenVersicherung(vs, today) : kennzahlenVorsorge(vs, today);
  return `<div class="kennzahl-raster${extra.length ? ` kennzahl-raster-${4 + extra.length}` : ""}">${basis}${extra.join("")}</div>`;
}

function renderDokumente(vs) {
  return kachel("dokumente", t("vermoegen.dokumente.titel"), dokumenteBrowserHtml([vs.vorsorge_id], belegOrdnerAusText(vs.quelle_hinweis)));
}

function renderAnhang(vs) {
  const staende = (data.zeitwerte ?? [])
    .filter((zw) => zw.entitaet === "vorsorge" && zw.entitaet_id === vs.vorsorge_id)
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || a.feld.localeCompare(b.feld));
  const wertstaende = staende.length
    ? staende.map((zw) => `
      <div class="wertstand-item">
        <div><strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong> <span class="muted">${escapeHtml(zw.feld === "rueckkaufswert" ? rkwLabel(vs) : t(FELD_LABEL[zw.feld] ?? zw.feld))}${ausserhalbVermoegen(vs, zw.feld) ? ` (${escapeHtml(t("vorsorge.nichtImVermoegen"))})` : ""} · ${escapeHtml(formatDate(zw.standdatum))}</span></div>
        <div>${qualitaetChip({ qualitaet: zw.qualitaet })}</div>
        ${zw.quelle_hinweis ? `<div class="muted">${quelleHtml(zw.quelle_hinweis)}</div>` : ""}
      </div>`).join("")
    : `<p class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</p>`;
  // Die Kachel ist per Default zu; wer sie oeffnet, will die Bemerkung lesen.
  const bemerkung = vs.bemerkung
    ? `<details class="bemerkung" open><summary>${escapeHtml(t("vorsorge.bemerkung"))}</summary>${bemerkungInhalt(vs.bemerkung)}</details>`
    : "";
  // Breite nutzen: Bemerkung links, Wertstaende rechts; ohne Bemerkung nur die Wertstaende.
  const staendeBlock = `<h3 class="section-subtitle">${escapeHtml(t("vermoegen.wertstaende"))}</h3>${wertstaende}`;
  return kachel("anhang", t("vorsorge.anhangTitel"), bemerkung
    ? `<div class="vorsorge-spalten vorsorge-spalten-breit"><div>${bemerkung}</div><div>${staendeBlock}</div></div>`
    : staendeBlock, "objekt-anhang");
}
