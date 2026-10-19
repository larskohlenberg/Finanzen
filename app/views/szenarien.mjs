// app/views/szenarien.mjs
// Szenarien: Liste, Detail als Zeitstrahl mit Phasen, Vergleich mehrerer. App ist
// nur Anzeige (ADR 0006) — Szenarien, Annahmen und Phasen entstehen ausschliesslich
// ueber den Agenten. Jede Detailseite beantwortet dieselben Fragen: Wie lange reicht
// die Liquiditaet? Wie kommen wir in jeder Phase aus? Wo steht das Vermoegen am Ende?
import { data, state, t, tf, fmt, escapeHtml, cents } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, categoryName, renderPageHead, heuteIso } from "../komponenten.mjs";
import { zeitstrahlDiagramm, stapelDiagramm } from "../charts.mjs";
import { computeSzenario, rechneSzenario, kippMonat, tiefpunkt, phasenKennzahlen, ereignisWirkung, jahresWerte, szenarioAenderungen, ereignisAnnahmen } from "../szenarien.mjs";
import { addInterval } from "../liquiditaet.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

// Aus den Buchungen brauchen die Szenarien nur den Startbestand (Positionen
// des Nettovermoegens) und die Zahl der Hinweise zum Prognose-Realismus; beides
// rechnet der App-Server (GET /api/v1/szenarien, app/szenarien-modell.mjs).
// Die Szenariorechnung selbst laeuft hier. renderSzenarien setzt die Antwort
// fuer die Dauer eines Zeichnens.
const cache = erstelleApiCache({ maxEintraege: 4 });
let grundlage = null;
const mitStart = () => ({ positionen: grundlage.positionen });

function szenarienAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/szenarien?${suche}`);
}

export const MAX_VERGLEICH = 7;
const PPJ = { tag: 365, woche: 52, monat: 12, jahr: 1 };

function qualitaetChip(q) {
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", "", "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[q] ?? stil.offen;
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t(`szenarien.quality${wort}`))}</span>`;
}

function statusChip(status) {
  const stil = { entwurf: "neutral", bestaetigt: "success", verworfen: "review" };
  return `<span class="chip ${stil[status] ?? "neutral"}">${escapeHtml(t(`szenarien.status.${status}`))}</span>`;
}

function rhythmusLabel(einheit, intervall) {
  const e = t(`vermoegen.rhythmus.${einheit}`);
  const einheitText = e === `vermoegen.rhythmus.${einheit}` ? einheit : e;
  return Number(intervall) > 1 ? `${intervall} ${einheitText}` : einheitText;
}

// Monat eines ISO-Datums ("YYYY-MM-DD") als "Monat Jahr". Szenarien rechnen im
// Monatsraster — der Horizont-Tag suggeriert sonst eine Praezision, die es nicht gibt.
function monatLabel(datumIso) {
  return datumIso ? formatMonth(String(datumIso).slice(0, 7)) : "—";
}

// Kompakte Achsenbeschriftung: 800 €, 12,5k €, 1,2 Mio. €.
function kurzBetrag(c) {
  const euro = c / 100;
  const zahl = (n, d) => fmt().zahl(n, d);
  const betrag = Math.abs(euro);
  const vz = euro < 0 ? "−" : "";
  if (betrag >= 1e6) return `${vz}${zahl(betrag / 1e6, 1)} ${t("szenarien.mio")} €`;
  if (betrag >= 1000) return `${vz}${zahl(betrag / 1000, 1)}k €`;
  return `${vz}${zahl(betrag, 0)} €`;
}

function kurzMonat(monat) {
  return `${monat.slice(5, 7)}/${monat.slice(2, 4)}`;
}

function vorzeichen(c) {
  return c > 0 ? `+${formatMoney(c)}` : formatMoney(c);
}

function reichtBisText(kipp, punkte) {
  return kipp ? formatMonth(kipp) : tf("szenarien.ueberHorizont", { monat: punkte.length ? formatMonth(punkte.at(-1).monat) : "—" });
}

function staleNote(szenario, today) {
  if (addInterval(szenario.stand, "monat", 6) >= today) return "";
  const text = `${t("szenarien.stalenessVon")} ${formatDate(szenario.stand)} ${t("szenarien.stalenessHinweis")}`;
  return `<p class="page-lead"><span class="chip review">${iconSvg("review")}${escapeHtml(text)}</span></p>`;
}

function warnKlartext(code) {
  const titel = t(`szenarien.warnCode.${code}.titel`);
  return titel === `szenarien.warnCode.${code}.titel` ? code : titel;
}

function warnGefahr(code) {
  return code === "liquiditaet-negativ" || code === "depot-ueberzogen";
}

function zielBezeichnung(zielTyp, zielId) {
  if (zielTyp === "immobilie") return (data.immobilien ?? []).find((i) => i.immobilie_id === zielId)?.bezeichnung ?? zielId;
  if (zielTyp === "vermoegenswert") return (data.vermoegenswerte ?? []).find((v) => v.vermoegenswert_id === zielId)?.bezeichnung ?? zielId;
  if (zielTyp === "darlehen") return (data.darlehen ?? []).find((d) => d.darlehen_id === zielId)?.bezeichnung ?? zielId;
  if (zielTyp === "depot") return (data.konten ?? []).find((k) => k.konto_id === zielId)?.name ?? zielId;
  if (zielTyp === "vorsorge") return (data.vorsorge ?? []).find((v) => v.vorsorge_id === zielId)?.name ?? zielId;
  return zielId;
}

function gegenbuchungLabel(g) {
  const ziel = g.ziel_id ? zielBezeichnung(g.ziel_typ, g.ziel_id) : (g.neue_position?.bezeichnung ?? "—");
  return `${t(`szenarien.zielTyp.${g.ziel_typ}`)}: ${ziel}`;
}

// Kurzname einer Annahme fuer Marker und Tabellen.
function annahmeName(a) {
  if (a.name) return a.name;
  if (a.art === "regelzahlung-aenderung") return (data.regelzahlungen ?? []).find((r) => r.regelzahlung_id === a.regelzahlung_id)?.bezeichnung ?? a.regelzahlung_id;
  if (a.art === "vorsorge-leistung") return zielBezeichnung("vorsorge", a.vorsorge_id);
  if (a.art === "ereignis") return `${t(`szenarien.fall.${a.fall}`)} ${(data.personen ?? []).find((p) => p.person_id === a.person_id)?.name ?? a.person_id}`;
  if (a.gegenbuchung) return gegenbuchungLabel(a.gegenbuchung);
  if (a.begruendung) return a.begruendung.length > 40 ? `${a.begruendung.slice(0, 38)}…` : a.begruendung;
  return t(`szenarien.art.${a.art}`);
}

const istEinmalig = (a) => a.art === "einmalzahlung" || (a.art === "vorsorge-leistung" && a.arm === "kapital");
const monatsBetrag = (betrag, einheit, intervall) => Math.round((cents(betrag) * PPJ[einheit ?? "monat"]) / 12 / Number(intervall || 1));

// --- Raster: Spalten (Jahr oder Monat) und Positionen auf der Zeitachse ---------

function spaltenAus(punkte, aufloesung) {
  if (aufloesung === "monat") return punkte.map((p) => ({ key: p.monat, label: kurzMonat(p.monat), titel: formatMonth(p.monat), monate: [p.monat] }));
  return jahresWerte(punkte).map((j) => ({
    key: j.jahr,
    label: j.jahr,
    titel: formatMonth(j.punkt.monat),
    monate: punkte.filter((p) => p.monat.startsWith(j.jahr)).map((p) => p.monat),
  }));
}

// Spaltenschluessel -> Wert (Jahr: letzter Monatspunkt des Jahres).
function werteJeSpalte(punkte, spalten, aufloesung, feld) {
  const map = new Map();
  for (const p of punkte) map.set(aufloesung === "monat" ? p.monat : p.monat.slice(0, 4), p[feld]);
  return spalten.map((s) => (map.has(s.key) ? map.get(s.key) : null));
}

function position(spalten, monat, ende = false) {
  if (!spalten.length) return 0;
  if (monat < spalten[0].monate[0]) return 0;
  for (let i = 0; i < spalten.length; i++) {
    const idx = spalten[i].monate.indexOf(monat);
    if (idx >= 0) return i + (idx + (ende ? 1 : 0)) / spalten[i].monate.length;
  }
  return spalten.length;
}

function phasenName(ph) {
  if (ph.art === "vorlauf") return t("szenarien.vorlauf");
  if (ph.art === "gesamt") return t("szenarien.gesamt");
  return ph.name;
}

// --- Liste ----------------------------------------------------------------------

export function renderSzenarien() {
  const today = heuteIso();
  const { antwort, fehler } = szenarienAntwort(today);
  // Die Positionen muessen zum Stand der Stammdaten im Browser passen (Konten
  // werden darin nachgeschlagen); eine Antwort eines anderen Stands gilt als
  // noch ladend, bis Antwort und Stammdaten wieder zusammenpassen.
  if (!antwort || antwort.stand !== data.metadata?.stand) {
    return `
    ${renderPageHead(t("szenarien.title"), t("szenarien.lead"))}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("szenarien.loadFailed")} (${fehler.message})` : t("szenarien.loading"))}</p></section>`;
  }
  grundlage = antwort;
  const szenarien = data.szenarien ?? [];
  const bekannt = new Set(szenarien.map((s) => s.szenario_id));

  if (state.szenarioVergleichIds?.length) {
    const ids = state.szenarioVergleichIds.filter((id) => bekannt.has(id)).slice(0, MAX_VERGLEICH);
    if (ids.length) return renderVergleich(ids.map((id) => szenarien.find((s) => s.szenario_id === id)), today);
    state.szenarioVergleichIds = [];
  }
  const selected = state.selectedSzenarioId ? szenarien.find((s) => s.szenario_id === state.selectedSzenarioId) : undefined;
  if (state.selectedSzenarioId && !selected) state.selectedSzenarioId = "";
  if (selected) return renderDetail(selected, today);

  const auswahl = state.szenarioAuswahl ?? new Set();
  const rows = szenarien.map((sz) => {
    const r = rechneSzenario(data, sz, today, mitStart());
    const kipp = kippMonat(r.punkte);
    const tief = tiefpunkt(r.punkte);
    const ende = r.punkte.at(-1);
    const gewaehlt = auswahl.has(sz.szenario_id);
    return `
    <tr class="clickable" data-action="open-szenario" data-szenario="${escapeHtml(sz.szenario_id)}" tabindex="0" role="button" aria-label="${escapeHtml(sz.name)}">
      <td class="auswahl-zelle"><input type="checkbox" data-action="toggle-szenario-auswahl" data-szenario="${escapeHtml(sz.szenario_id)}" ${gewaehlt ? "checked" : ""} aria-label="${escapeHtml(t("szenarien.zumVergleich"))}: ${escapeHtml(sz.name)}"></td>
      <td>${escapeHtml(sz.name)}</td>
      <td>${statusChip(sz.status)}</td>
      <td class="amount">${escapeHtml(String(sz.phasen?.length || 1))}</td>
      <td class="${kipp ? "amount-negativ" : ""}">${escapeHtml(kipp ? formatMonth(kipp) : tf("szenarien.ueberHorizontKurz", { monat: ende ? kurzMonat(ende.monat) : "—" }))}</td>
      <td class="amount ${tief && tief.cents < 0 ? "amount-negativ" : ""}">${tief ? `${escapeHtml(formatMoney(tief.cents))} <span class="muted">${escapeHtml(kurzMonat(tief.monat))}</span>` : "—"}</td>
      <td class="amount">${ende ? escapeHtml(formatMoney(ende.netto_cents)) : "—"}</td>
      <td>${qualitaetChip(r.qualitaet)}</td>
    </tr>`;
  }).join("");

  const anzahl = [...auswahl].filter((id) => bekannt.has(id)).length;
  const vergleichLeiste = anzahl >= 2
    ? `<button class="pager-button vergleich-button" data-action="szenarien-vergleichen">${iconSvg("chevronRight")}${escapeHtml(tf("szenarien.vergleichen", { n: String(anzahl) }))}</button>`
    : `<span class="muted">${escapeHtml(t("szenarien.vergleichHinweis"))}</span>`;

  return `
    ${renderPageHead(t("szenarien.title"), t("szenarien.lead"))}
    <section class="panel">
      <div class="szenario-leiste">${vergleichLeiste}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th class="auswahl-zelle"><span class="sr-only">${escapeHtml(t("szenarien.zumVergleich"))}</span></th>
            <th>${escapeHtml(t("szenarien.name"))}</th>
            <th>${escapeHtml(t("szenarien.statusHead"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.phasenAnzahl"))}</th>
            <th>${escapeHtml(t("szenarien.reichtBis"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.tiefpunkt"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.nettoHorizont"))}</th>
            <th>${escapeHtml(t("szenarien.qualitaetHead"))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="8" class="muted">${escapeHtml(t("szenarien.noSzenarien"))}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

// --- Detail ---------------------------------------------------------------------

function vergleichsRechnung(szenario, today) {
  const anderes = state.szenarioVergleichMit
    ? (data.szenarien ?? []).find((s) => s.szenario_id === state.szenarioVergleichMit && s.szenario_id !== szenario.szenario_id)
    : undefined;
  if (state.szenarioVergleichMit && !anderes) state.szenarioVergleichMit = "";
  if (anderes) return { label: anderes.name, r: rechneSzenario(data, anderes, today, mitStart()) };
  return { label: t("szenarien.basis"), r: rechneSzenario(data, { ...szenario, annahmen: [] }, today, mitStart()) };
}

function beschreibungHtml(szenario) {
  const text = szenario.beschreibung ?? "";
  if (!text) return "";
  const satzEnde = text.search(/[.!?](\s|$)/);
  const erster = satzEnde > 0 ? text.slice(0, satzEnde + 1) : text;
  if (erster.length >= text.length) return `<p class="page-lead">${escapeHtml(text)}</p>`;
  const offen = state.szenarioBeschreibungOffen;
  return `<p class="page-lead">${escapeHtml(offen ? text : erster)}
    <button class="linkish" data-action="toggle-szenario-beschreibung" aria-expanded="${offen}">${escapeHtml(t(offen ? "szenarien.weniger" : "szenarien.mehr"))}</button></p>`;
}

function warnungenHtml(warnungen) {
  if (!warnungen.length) return "";
  const codes = [...new Map(warnungen.map((w) => [w.code, w])).values()];
  return `
    <details class="szenario-warnungen">
      <summary>${codes.map((w) => `<span class="chip ${warnGefahr(w.code) ? "danger" : "review"}">${iconSvg("review")}${escapeHtml(warnKlartext(w.code))}</span>`).join(" ")}</summary>
      <ul>${warnungen.map((w) => `<li>${escapeHtml(w.text)}</li>`).join("")}</ul>
    </details>`;
}

function kachel(titel, wert, zeilen, negativ = false) {
  return `
    <div class="tile tile-static">
      <strong>${escapeHtml(titel)}</strong>
      <div class="count ${negativ ? "amount-negativ" : ""}">${escapeHtml(wert)}</div>
      ${zeilen.map((z) => `<div class="kpi-note">${z}</div>`).join("")}
    </div>`;
}

function deltaText(c, vergleichLabel) {
  if (c === 0) return `${escapeHtml(t("szenarien.gleichWie"))} ${escapeHtml(vergleichLabel)}`;
  return `<span class="${c < 0 ? "amount-negativ" : "amount-positiv"}">${escapeHtml(vorzeichen(c))}</span> ${escapeHtml(t("szenarien.ggue"))} ${escapeHtml(vergleichLabel)}`;
}

function antwortZeile(szenario, r, v, today) {
  const kipp = kippMonat(r.punkte);
  const vKipp = kippMonat(v.r.punkte);
  const tief = tiefpunkt(r.punkte);
  const vTief = tiefpunkt(v.r.punkte);
  const ende = r.punkte.at(-1);
  const vEnde = v.r.punkte.at(-1);
  const annahmenById = new Map((szenario.annahmen ?? []).map((a) => [a.annahme_id, a]));
  const wirkung = ereignisWirkung(data, szenario, today, mitStart()).map((w) => {
    const a = annahmenById.get(w.annahme_id);
    return `${escapeHtml(t("szenarien.ohne"))} ${escapeHtml(a ? annahmeName(a) : w.annahme_id)}: ${escapeHtml(reichtBisText(w.kipp_monat, r.punkte))}`;
  });
  return `
    <div class="tile-grid">
      ${kachel(t("szenarien.reichtBis"), kipp ? formatMonth(kipp) : t("szenarien.ganzerHorizont"), [
        kipp ? "" : escapeHtml(tf("szenarien.keinEngpass", { monat: ende ? formatMonth(ende.monat) : "—" })),
        `${escapeHtml(v.label)}: ${escapeHtml(reichtBisText(vKipp, v.r.punkte))}`,
        ...wirkung,
      ].filter(Boolean), Boolean(kipp))}
      ${kachel(t("szenarien.tiefpunkt"), tief ? formatMoney(tief.cents) : "—", [tief ? escapeHtml(formatMonth(tief.monat)) : "", tief && vTief ? deltaText(tief.cents - vTief.cents, v.label) : ""].filter(Boolean), Boolean(tief && tief.cents < 0))}
      ${kachel(`${t("szenarien.nettoverm")} ${ende ? formatMonth(ende.monat) : ""}`, ende ? formatMoney(ende.netto_cents) : "—", [r.punkte.length ? `${escapeHtml(t("szenarien.jetzt"))}: ${escapeHtml(formatMoney(r.punkte[0].netto_cents))}` : "", ende && vEnde ? deltaText(ende.netto_cents - vEnde.netto_cents, v.label) : ""].filter(Boolean))}
    </div>`;
}

function umschalter(action, aktiv, optionen) {
  return `<div class="segment" role="group">${optionen.map(([wert, label]) => `<button class="segment-button ${aktiv === wert ? "active" : ""}" data-action="${action}" data-wert="${wert}" aria-pressed="${aktiv === wert}">${escapeHtml(label)}</button>`).join("")}</div>`;
}

function zeitstrahl(szenario, r, v, phasen) {
  const aufloesung = state.szenarioAufloesung === "monat" ? "monat" : "jahr";
  const modus = state.szenarioDiagrammModus === "differenz" ? "differenz" : "absolut";
  const spalten = spaltenAus(r.punkte, aufloesung);
  const eigene = werteJeSpalte(r.punkte, spalten, aufloesung, "liquide_cents");
  const fremde = werteJeSpalte(v.r.punkte, spalten, aufloesung, "liquide_cents");
  const serien = modus === "differenz"
    ? [{ klasse: "differenz", label: `${t("szenarien.abstandZu")} ${v.label}`, werte: eigene.map((w, i) => (w == null || fremde[i] == null ? null : w - fremde[i])) }]
    : [{ klasse: "szenario", label: szenario.name, werte: eigene }, { klasse: "vergleich", label: v.label, werte: fremde }];
  const baender = phasen.length > 1
    ? phasen.map((ph) => ({ name: phasenName(ph), von: position(spalten, ph.von), bis: position(spalten, ph.bis, true) }))
    : [];
  const horizontMonat = r.punkte.at(-1)?.monat ?? "";
  const ereignisse = (szenario.annahmen ?? [])
    .filter((a) => istEinmalig(a) || a.art === "ereignis")
    .map((a) => ({ a, monat: String(a.art === "einmalzahlung" ? a.datum : a.ab).slice(0, 7) }))
    .filter(({ monat }) => monat >= (r.punkte[0]?.monat ?? "") && monat <= horizontMonat)
    .map(({ a, monat }) => {
      const betrag = a.art === "einmalzahlung" && a.betrag && a.betrag !== "0.00" ? ` ${kurzBetrag(cents(a.betrag))}` : "";
      return { pos: (position(spalten, monat) + position(spalten, monat, true)) / 2, label: `${annahmeName(a)}${betrag}` };
    });
  const svg = zeitstrahlDiagramm({ spalten, serien, phasen: baender, ereignisse, formatWert: formatMoney, formatAchse: kurzBetrag, ariaLabel: t("szenarien.liquiditaetVerlauf") });
  const legende = `<div class="stapel-legende">${serien.map((s) => `<span><span class="legende-linie ${s.klasse}"></span>${escapeHtml(s.label)}</span>`).join("")}</div>`;
  return `
    <section class="panel panel-pad section-spacing">
      <div class="szenario-diagramm-kopf">
        <h2 class="section-title">${escapeHtml(t("szenarien.liquiditaetVerlauf"))}</h2>
        <div class="szenario-schalter">
          ${umschalter("set-szenario-modus", modus, [["absolut", t("szenarien.absolut")], ["differenz", t("szenarien.differenz")]])}
          ${umschalter("set-szenario-aufloesung", aufloesung, [["jahr", t("szenarien.jahre")], ["monat", t("szenarien.monate")]])}
        </div>
      </div>
      ${svg ? `${legende}<div class="diagramm-wrap">${svg}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
    </section>`;
}

// --- Was sich aendert: chronologisch, je Monat mit Summe der Monatswirkung ------

function quelleChip(q) {
  return `<span class="quelle-chip ${q}">${escapeHtml(t(q === "bestand" ? "szenarien.quelleBestand" : "szenarien.quelleAnnahme"))}</span>`;
}

function betragText(z) {
  return `${formatMoney(cents(z.betrag))} / ${rhythmusLabel(z.rhythmus_einheit, z.rhythmus_intervall)}`;
}

function aenderungZeile(e) {
  const alt = e.alt ? `<s class="alt-wert">${escapeHtml(betragText(e.alt))}</s>` : "";
  let wert;
  if (e.art === "einmalig") wert = `${escapeHtml(vorzeichen(e.einmal_cents))} ${escapeHtml(t("szenarien.einmalig"))}`;
  else if (e.art === "neu") wert = `<span class="neu-wert">${escapeHtml(betragText(e.neu))}</span> <span class="muted">${escapeHtml(t("szenarien.neuLabel"))}</span>`;
  else if (e.art === "beendet") wert = `${alt} → ${escapeHtml(t("szenarien.entfaellt"))}`;
  else if (e.art === "auslauf") wert = `${alt} → ${escapeHtml(t("szenarien.laeuftAus"))}`;
  else wert = `${alt} → <span class="neu-wert">${escapeHtml(betragText(e.neu))}</span>`;
  const name = e.art === "ersetzt" && e.alt.name !== e.name
    ? `<s class="alt-wert">${escapeHtml(e.alt.name)}</s><br>${escapeHtml(e.name)}`
    : (e.art === "beendet" || e.art === "auslauf" ? `<s class="alt-wert">${escapeHtml(e.name)}</s>` : escapeHtml(e.name));
  const link = e.regelzahlung_id && e.art !== "einmalig"
    ? `<button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(e.regelzahlung_id)}">${name}</button>`
    : name;
  const wirkung = e.art === "einmalig"
    ? ""
    : `<span class="${e.delta_cents < 0 ? "amount-negativ" : e.delta_cents > 0 ? "amount-positiv" : ""}">${escapeHtml(vorzeichen(e.delta_cents))}</span>`;
  return `
    <tr>
      <td>${link} ${e.quellen.map(quelleChip).join(" ")}</td>
      <td>${wert}</td>
      <td class="amount">${wirkung}</td>
      <td class="muted">${escapeHtml(formatDate(e.datum))}</td>
    </tr>`;
}

function aenderungenAbschnitt(szenario, today) {
  const liste = szenarioAenderungen(data, szenario, today);
  const monate = [];
  for (const e of liste) {
    const monat = e.datum.slice(0, 7);
    if (monate.at(-1)?.monat !== monat) monate.push({ monat, eintraege: [] });
    monate.at(-1).eintraege.push(e);
  }
  const inhalt = monate.length
    ? `<div class="table-wrap"><table class="aenderungen-tabelle">
        <thead><tr>
          <th>${escapeHtml(t("szenarien.posten"))}</th>
          <th>${escapeHtml(t("szenarien.vorherNachher"))}</th>
          <th class="amount">${escapeHtml(t("szenarien.wirkungMonat"))}</th>
          <th>${escapeHtml(t("szenarien.ab"))}</th>
        </tr></thead>
        <tbody>${monate.map((m) => {
          const summe = m.eintraege.reduce((s, e) => s + e.delta_cents, 0);
          const kopf = `<tr class="aenderung-monat"><th colspan="2">${escapeHtml(formatMonth(m.monat))}</th><th class="amount">${summe ? `<span class="${summe < 0 ? "amount-negativ" : "amount-positiv"}">${escapeHtml(vorzeichen(summe))}</span>` : ""}</th><th></th></tr>`;
          return kopf + m.eintraege.map(aenderungZeile).join("");
        }).join("")}</tbody>
      </table></div>`
    : `<p class="muted">${escapeHtml(t("szenarien.keineAenderungen"))}</p>`;
  return `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.aenderungenTitle"))}</h2>
      <p class="muted">${escapeHtml(t("szenarien.aenderungenLead"))}</p>
      ${inhalt}
    </section>`;
}

function annahmeZeile(a) {
  const q = qualitaetChip(a.qualitaet);
  const begr = a.begruendung ? `<div class="muted annahme-begruendung">${escapeHtml(a.begruendung)}</div>` : "";
  const ab = a.art === "einmalzahlung" ? a.datum : a.ab;
  let vorher = "—";
  let nachher = "—";
  let wirkung = "—";
  let posten = escapeHtml(annahmeName(a));
  if (a.art === "regelzahlung-aenderung") {
    const orig = (data.regelzahlungen ?? []).find((r) => r.regelzahlung_id === a.regelzahlung_id);
    posten = `<button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(a.regelzahlung_id)}">${posten}</button>`;
    if (orig) vorher = `${formatMoney(cents(orig.betrag))} / ${rhythmusLabel(orig.rhythmus_einheit, orig.rhythmus_intervall)}`;
    const alt = orig ? monatsBetrag(orig.betrag, orig.rhythmus_einheit, orig.rhythmus_intervall) : 0;
    if (a.aktion === "beenden") {
      nachher = t("szenarien.aktionBeenden");
      wirkung = `${vorzeichen(-alt)} / ${t("szenarien.monatKurz")}`;
    } else {
      nachher = `${formatMoney(cents(a.betrag))} / ${rhythmusLabel(orig?.rhythmus_einheit ?? "monat", orig?.rhythmus_intervall ?? 1)}`;
      const neu = monatsBetrag(a.betrag, orig?.rhythmus_einheit, orig?.rhythmus_intervall);
      wirkung = `${vorzeichen(neu - alt)} / ${t("szenarien.monatKurz")}`;
    }
  } else if (a.art === "regelzahlung-neu") {
    nachher = `${formatMoney(cents(a.betrag))} / ${rhythmusLabel(a.rhythmus_einheit, a.rhythmus_intervall)}${a.bis ? ` ${t("szenarien.bis")} ${monatLabel(a.bis)}` : ""}`;
    wirkung = `${vorzeichen(monatsBetrag(a.betrag, a.rhythmus_einheit, a.rhythmus_intervall))} / ${t("szenarien.monatKurz")}`;
  } else if (a.art === "einmalzahlung") {
    nachher = a.gegenbuchung ? gegenbuchungLabel(a.gegenbuchung) : t("szenarien.art.einmalzahlung");
    wirkung = `${vorzeichen(cents(a.betrag))} ${t("szenarien.einmalig")}`;
  } else if (a.art === "vorsorge-leistung") {
    const arm = t(`szenarien.arm.${a.arm}`);
    nachher = arm === `szenarien.arm.${a.arm}` ? a.arm : arm;
  } else if (a.art === "ereignis") {
    nachher = `${t(`szenarien.ereignisFolge.${a.fall}`)}${a.bis ? ` ${t("szenarien.bis")} ${monatLabel(a.bis)}` : ""}`;
    // Monatswirkung zu Beginn: entfallende Beitraege plus einsetzende Renten.
    const folgen = ereignisAnnahmen(data, a, heuteIso());
    const monat = folgen.reduce((s, f) => {
      if (f.art === "regelzahlung-neu" && f.ab === a.ab) return s + monatsBetrag(f.betrag, f.rhythmus_einheit, f.rhythmus_intervall);
      if (f.art !== "regelzahlung-aenderung") return s;
      const r = (data.regelzahlungen ?? []).find((x) => x.regelzahlung_id === f.regelzahlung_id);
      return r ? s - monatsBetrag(r.betrag, r.rhythmus_einheit, r.rhythmus_intervall) : s;
    }, 0);
    if (folgen.length) wirkung = `${vorzeichen(monat)} / ${t("szenarien.monatKurz")}`;
  }
  const artText = `${t(`szenarien.art.${a.art}`)}${a.art === "vorsorge-leistung" ? ` · ${a.vorsorge_id}` : ""}`;
  return `
    <tr>
      <td>${posten} ${q}<div class="muted annahme-art">${escapeHtml(artText)}</div>${begr}</td>
      <td>${escapeHtml(vorher)}</td>
      <td>${escapeHtml(nachher)}</td>
      <td class="amount">${escapeHtml(wirkung)}</td>
      <td>${ab ? escapeHtml(kurzMonat(String(ab).slice(0, 7))) : "—"}</td>
    </tr>`;
}

function phasenTabelle(szenario, phasen) {
  const annahmenById = new Map((szenario.annahmen ?? []).map((a) => [a.annahme_id, a]));
  const offen = state.szenarioPhaseOffen ?? new Set();
  const zeilen = phasen.map((ph, i) => {
    const istOffen = offen.has(i);
    const annahmen = ph.annahme_ids.map((id) => annahmenById.get(id)).filter(Boolean);
    const kopf = `
      <tr class="clickable" data-action="toggle-szenario-phase" data-phase="${i}" tabindex="0" role="button" aria-expanded="${istOffen}">
        <td><span class="toggle-icon">${iconSvg(istOffen ? "chevronDown" : "chevronRight")}</span>${escapeHtml(phasenName(ph))} <span class="muted">· ${annahmen.length} ${escapeHtml(t(annahmen.length === 1 ? "szenarien.annahmeKurz" : "szenarien.annahmenKurz"))}</span></td>
        <td>${escapeHtml(kurzMonat(ph.von))} – ${escapeHtml(kurzMonat(ph.bis))}</td>
        <td class="amount">${escapeHtml(formatMoney(ph.ein_cents))}</td>
        <td class="amount">${escapeHtml(formatMoney(ph.aus_cents))}</td>
        <td class="amount ${ph.saldo_cents < 0 ? "amount-negativ" : ""}">${escapeHtml(vorzeichen(ph.saldo_cents))}</td>
        <td class="amount">${ph.einmal_cents ? escapeHtml(vorzeichen(ph.einmal_cents)) : "—"}</td>
        <td class="amount ${ph.liquide_ende_cents < 0 ? "amount-negativ" : ""}">${escapeHtml(formatMoney(ph.liquide_ende_cents))}</td>
      </tr>`;
    if (!istOffen) return kopf;
    const inhalt = annahmen.length
      ? `<table class="annahmen-tabelle">
          <thead><tr>
            <th>${escapeHtml(t("szenarien.posten"))}</th>
            <th>${escapeHtml(t("szenarien.vorher"))}</th>
            <th>${escapeHtml(t("szenarien.nachher"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.wirkung"))}</th>
            <th>${escapeHtml(t("szenarien.ab"))}</th>
          </tr></thead>
          <tbody>${annahmen.map(annahmeZeile).join("")}</tbody>
        </table>`
      : `<p class="muted">${escapeHtml(t("szenarien.keineAnnahmenInPhase"))}</p>`;
    return `${kopf}<tr class="phase-detail"><td colspan="7">${inhalt}</td></tr>`;
  }).join("");
  return `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.phasenTitle"))}</h2>
      <p class="muted">${escapeHtml(t("szenarien.phasenLead"))}</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${escapeHtml(t("szenarien.phase"))}</th>
            <th>${escapeHtml(t("szenarien.zeitraum"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.einnahmenMonat"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.ausgabenMonat"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.saldoMonat"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.einmalSumme"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.liquideEndePhase"))}</th>
          </tr></thead>
          <tbody>${zeilen}</tbody>
        </table>
      </div>
    </section>`;
}

function klappKopf(action, offen, titel, zusatz = "") {
  return `
    <button class="row-toggle klapp-kopf" data-action="${action}" aria-expanded="${offen}">
      <span class="toggle-icon">${iconSvg(offen ? "chevronDown" : "chevronRight")}</span>${escapeHtml(titel)}${zusatz}
    </button>`;
}

function nettoAbschnitt(r) {
  const offen = state.szenarioNettoOffen;
  const kopf = klappKopf("toggle-szenario-netto", offen, t("szenarien.nettovermoegenVerlauf"));
  if (!offen) return `<section class="panel panel-pad section-spacing">${kopf}</section>`;
  const jahre = jahresWerte(r.punkte);
  const spalten = jahre.map((j) => ({ label: j.jahr, titel: formatMonth(j.punkt.monat) }));
  const reihe = (feld, vz = 1) => jahre.map((j) => vz * j.punkt[feld]);
  const teile = [
    { klasse: "liquide", label: t("szenarien.liquide"), werte: reihe("liquide_cents") },
    { klasse: "depot", label: t("szenarien.depot"), werte: reihe("depot_cents") },
    { klasse: "sachwerte", label: t("szenarien.sachwerte"), werte: reihe("sachwerte_cents") },
    { klasse: "restschuld", label: t("szenarien.restschuld"), werte: reihe("restschuld_cents", -1) },
  ];
  const tabelle = state.szenarioNettoTabelle;
  const inhalt = tabelle
    ? `<div class="table-wrap"><table>
        <thead><tr><th>${escapeHtml(t("szenarien.jahr"))}</th>${teile.map((x) => `<th class="amount">${escapeHtml(x.label)}</th>`).join("")}<th class="amount">${escapeHtml(t("szenarien.nettoverm"))}</th></tr></thead>
        <tbody>${jahre.map((j, i) => `<tr><td>${escapeHtml(spalten[i].titel)}</td>${teile.map((x) => `<td class="amount">${escapeHtml(formatMoney(x.werte[i]))}</td>`).join("")}<td class="amount"><strong>${escapeHtml(formatMoney(j.punkt.netto_cents))}</strong></td></tr>`).join("")}</tbody>
      </table></div>`
    : `<div class="diagramm-wrap">${stapelDiagramm({ spalten, teile, netto: { label: t("szenarien.nettoverm"), werte: reihe("netto_cents") }, formatWert: formatMoney, formatAchse: kurzBetrag, ariaLabel: t("szenarien.nettovermoegenVerlauf") })}</div>
       <div class="stapel-legende">${teile.map((x) => `<span><span class="legende-swatch ${x.klasse}"></span>${escapeHtml(x.label)}</span>`).join("")}<span><span class="legende-swatch saldo"></span>${escapeHtml(t("szenarien.nettoverm"))}</span></div>`;
  return `
    <section class="panel panel-pad section-spacing">
      <div class="szenario-diagramm-kopf">${kopf}${umschalter("set-szenario-netto-ansicht", tabelle ? "tabelle" : "diagramm", [["diagramm", t("szenarien.diagramm")], ["tabelle", t("szenarien.tabelle")]])}</div>
      <p class="muted">${escapeHtml(t("szenarien.sachwerteEingefroren"))}</p>
      ${inhalt}
    </section>`;
}

function vermoegenLink(zielTyp, zielId, bezeichnung) {
  if ((zielTyp === "immobilie" || zielTyp === "vermoegenswert") && zielId) {
    return `<button class="linkish" data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(zielTyp)}" data-vid="${escapeHtml(zielId)}">${escapeHtml(bezeichnung)}</button>`;
  }
  if (zielTyp === "depot" && zielId) {
    return `<button class="linkish" data-action="open-account-master" data-account="${escapeHtml(zielId)}">${escapeHtml(bezeichnung)}</button>`;
  }
  return escapeHtml(bezeichnung);
}

function objektZeile(bezeichnungHtml, text) {
  return `<div class="rail-item"><div><strong>${bezeichnungHtml}</strong></div><div>${text}</div></div>`;
}

// Wirkung auf Objekte immer gegenueber der annahmenfreien Basis.
function renderObjektwirkungen(c) {
  const items = [];
  const basisDarlehen = new Map((c.basis.darlehen ?? []).map((d) => [d.darlehen_id, d]));
  for (const d of c.szenario.darlehen ?? []) {
    const b = basisDarlehen.get(d.darlehen_id);
    if (!b) continue;
    if (d.abbezahlt_am !== b.abbezahlt_am) {
      const szT = d.abbezahlt_am ? monatLabel(d.abbezahlt_am) : t("szenarien.nichtGetilgt");
      const baT = b.abbezahlt_am ? monatLabel(b.abbezahlt_am) : t("szenarien.nichtGetilgt");
      items.push(objektZeile(escapeHtml(d.bezeichnung), `${escapeHtml(t("szenarien.darlehenAbbezahlt"))}: ${escapeHtml(baT)} <span class="muted">→</span> ${escapeHtml(szT)}`));
    } else if (d.ende_cents !== b.ende_cents) {
      items.push(objektZeile(escapeHtml(d.bezeichnung), `${escapeHtml(t("szenarien.restschuldEnde"))}: ${escapeHtml(formatMoney(b.ende_cents))} <span class="muted">→</span> ${escapeHtml(formatMoney(d.ende_cents))}`));
    }
  }
  const basisDepot = new Map((c.basis.depots ?? []).map((d) => [d.konto_id, d]));
  for (const d of c.szenario.depots ?? []) {
    const b = basisDepot.get(d.konto_id);
    if (!b || d.ende_cents === b.ende_cents) continue;
    items.push(objektZeile(vermoegenLink("depot", d.konto_id, d.bezeichnung), `${escapeHtml(t("szenarien.depotWert"))}: ${escapeHtml(formatMoney(b.ende_cents))} <span class="muted">→</span> ${escapeHtml(formatMoney(d.ende_cents))}`));
  }
  for (const s of c.szenario.sachwertwirkungen ?? []) {
    const vz = s.art === "aufbau" ? "+" : "−";
    items.push(objektZeile(vermoegenLink(s.ziel_typ, s.ziel_id, s.bezeichnung), `${escapeHtml(formatDate(s.datum))} · ${vz} ${escapeHtml(formatMoney(s.wert_cents))}`));
  }
  for (const v of c.szenario.vorsorgewirkungen ?? []) {
    items.push(objektZeile(escapeHtml(v.bezeichnung), `${escapeHtml(formatDate(v.datum))} · − ${escapeHtml(formatMoney(v.rueckkaufswert_cents))}`));
  }
  if (!items.length) return "";
  return `
    <h3 class="section-title section-subtitle">${escapeHtml(t("szenarien.objektwirkungTitle"))}</h3>
    <div class="rail-list section-spacing">${items.join("")}</div>`;
}

function renderBasisRegelzahlungen(r, endeMonat, aenderungen = []) {
  const rz = r.basisRegelzahlungen ?? [];
  const markiert = new Map();
  for (const e of aenderungen) {
    if (e.art === "beendet" || e.art === "geaendert") markiert.set(e.regelzahlung_id, e);
    if (e.art === "ersetzt" && e.ersetzt_regelzahlung_id) markiert.set(e.ersetzt_regelzahlung_id, e);
  }
  const expanded = state.szenarioBasisExpanded;
  const kopf = klappKopf("toggle-szenario-basis", expanded, t("szenarien.basisRzTitle"), ` <span class="muted">· ${rz.length} ${escapeHtml(t("szenarien.ausDerBasis"))}</span>`);
  if (!expanded) return kopf;
  const rows = rz.map((x) => {
    const bis = x.aktiv_bis ? formatDate(x.aktiv_bis) : tf("szenarien.unbefristetBis", { monat: endeMonat });
    return `
    <tr>
      <td><button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(x.regelzahlung_id)}">${escapeHtml(x.bezeichnung)}</button></td>
      <td class="amount">${(() => {
        const e = markiert.get(x.regelzahlung_id);
        const basis = `${formatMoney(cents(x.betrag))} / ${rhythmusLabel(x.rhythmus_einheit, x.rhythmus_intervall)}`;
        if (!e) return escapeHtml(basis);
        const nachher = e.art === "beendet" ? t("szenarien.entfaellt") : e.art === "ersetzt" ? `${e.name}: ${betragText(e.neu)}` : betragText(e.neu);
        return `<s class="alt-wert">${escapeHtml(basis)}</s><br><span class="neu-wert">${escapeHtml(nachher)}</span> <span class="muted">${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(e.datum))}</span>`;
      })()}</td>
      <td>${x.kategorie_id ? escapeHtml(categoryName(x.kategorie_id)) : "—"}</td>
      <td>${escapeHtml(bis)}</td>
    </tr>`;
  }).join("");
  return `
    ${kopf}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
          <th class="amount">${escapeHtml(t("labels.amount"))}</th>
          <th>${escapeHtml(t("szenarien.kategorieHead"))}</th>
          <th>${escapeHtml(t("szenarien.gueltigBis"))}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">${escapeHtml(t("szenarien.keineBasisRz"))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function rechengrundlage(szenario, today) {
  const offen = state.szenarioGrundlageOffen;
  const kopf = klappKopf("toggle-szenario-grundlage", offen, t("szenarien.rechengrundlageTitle"));
  if (!offen) return `<section class="panel panel-pad section-spacing">${kopf}</section>`;
  const c = computeSzenario(data, szenario, today, mitStart());
  const guardrails = grundlage.guardrails;
  const hinweis = guardrails ? `
    <p class="page-lead">
      <span class="chip neutral">${iconSvg("review")}${escapeHtml(tf("szenarien.prognosebasisHinweis", { n: String(guardrails) }))}</span>
      <button class="linkish" data-action="show-checks">${escapeHtml(t("szenarien.zuChecks"))}</button>
    </p>` : "";
  return `
    <section class="panel panel-pad section-spacing">
      ${kopf}
      ${renderObjektwirkungen(c)}
      <div class="section-spacing">${renderBasisRegelzahlungen(c.szenario, monatLabel(szenario.reichweite_bis), szenarioAenderungen(data, szenario, today))}</div>
      ${hinweis}
    </section>`;
}

function renderDetail(szenario, today) {
  const r = rechneSzenario(data, szenario, today, mitStart());
  const v = vergleichsRechnung(szenario, today);
  const phasen = phasenKennzahlen(szenario, r.punkte);
  const andere = (data.szenarien ?? []).filter((s) => s.szenario_id !== szenario.szenario_id);
  const auswahl = `
    <label class="szenario-vergleich-wahl">${escapeHtml(t("szenarien.vergleichMit"))}
      <select data-control="szenario-vergleich">
        <option value="" ${state.szenarioVergleichMit ? "" : "selected"}>${escapeHtml(t("szenarien.basisOhneAnnahmen"))}</option>
        ${andere.map((s) => `<option value="${escapeHtml(s.szenario_id)}" ${state.szenarioVergleichMit === s.szenario_id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
      </select>
    </label>`;
  const meta = `${t(`szenarien.status.${szenario.status}`)} · ${t("szenarien.standLabel")} ${formatDate(szenario.stand)} · ${t("szenarien.prognoseBis")} ${monatLabel(szenario.reichweite_bis)}`;
  return `
    <div class="page-head szenario-kopf">
      <div>
        <button class="linkish" data-action="back-to-szenarien">${iconSvg("chevronLeft")}${escapeHtml(t("szenarien.backToList"))}</button>
        <h1 class="page-title">${escapeHtml(szenario.name)}</h1>
        <p class="kpi-note">${escapeHtml(meta)} ${qualitaetChip(r.qualitaet)}</p>
        ${beschreibungHtml(szenario)}
      </div>
      ${auswahl}
    </div>
    ${staleNote(szenario, today)}
    ${warnungenHtml(r.warnungen ?? [])}
    ${antwortZeile(szenario, r, v, today)}
    ${zeitstrahl(szenario, r, v, phasen)}
    ${aenderungenAbschnitt(szenario, today)}
    ${phasenTabelle(szenario, phasen)}
    ${nettoAbschnitt(r)}
    ${rechengrundlage(szenario, today)}`;
}

// --- Vergleich ------------------------------------------------------------------

function renderVergleich(szenarien, today) {
  const rechnungen = szenarien.map((sz) => ({ sz, r: rechneSzenario(data, sz, today, mitStart()) }));
  const alleMonate = [...new Set(rechnungen.flatMap(({ r }) => r.punkte.map((p) => p.monat)))].sort();
  const raster = alleMonate.map((monat) => ({ monat }));
  const spalten = spaltenAus(raster, "jahr");
  const serien = rechnungen.map(({ sz, r }, i) => ({ klasse: `serie-${i}`, label: sz.name, werte: werteJeSpalte(r.punkte, spalten, "jahr", "liquide_cents") }));
  const svg = zeitstrahlDiagramm({ spalten, serien, formatWert: formatMoney, formatAchse: kurzBetrag, ariaLabel: t("szenarien.vergleichTitel") });
  const zeilen = [
    [t("szenarien.reichtBis"), ({ r }) => { const k = kippMonat(r.punkte); return `<span class="${k ? "amount-negativ" : ""}">${escapeHtml(reichtBisText(k, r.punkte))}</span>`; }],
    [t("szenarien.tiefpunkt"), ({ r }) => { const tp = tiefpunkt(r.punkte); return tp ? `${escapeHtml(formatMoney(tp.cents))} <span class="muted">${escapeHtml(kurzMonat(tp.monat))}</span>` : "—"; }],
    [t("szenarien.nettoHorizont"), ({ r }) => escapeHtml(formatMoney(r.punkte.at(-1)?.netto_cents ?? 0))],
    [t("szenarien.horizont"), ({ sz }) => escapeHtml(monatLabel(sz.reichweite_bis))],
    [t("szenarien.phasenAnzahl"), ({ sz }) => escapeHtml(String(sz.phasen?.length || 1))],
    [t("szenarien.qualitaetHead"), ({ r }) => qualitaetChip(r.qualitaet)],
  ];
  return `
    <div class="page-head">
      <div>
        <button class="linkish" data-action="back-to-szenarien">${iconSvg("chevronLeft")}${escapeHtml(t("szenarien.backToList"))}</button>
        <h1 class="page-title">${escapeHtml(t("szenarien.vergleichTitel"))}</h1>
        <p class="page-lead">${escapeHtml(t("szenarien.vergleichLead"))}</p>
      </div>
    </div>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.liquiditaetVerlauf"))}</h2>
      <div class="stapel-legende">${serien.map((s) => `<span><span class="legende-swatch ${s.klasse}"></span>${escapeHtml(s.label)}</span>`).join("")}</div>
      ${svg ? `<div class="diagramm-wrap">${svg}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
    </section>
    <section class="panel section-spacing">
      <div class="table-wrap">
        <table>
          <thead><tr><th></th>${rechnungen.map(({ sz }, i) => `<th><span class="legende-swatch serie-${i}"></span><button class="linkish" data-action="open-szenario" data-szenario="${escapeHtml(sz.szenario_id)}">${escapeHtml(sz.name)}</button></th>`).join("")}</tr></thead>
          <tbody>${zeilen.map(([label, f]) => `<tr><th scope="row">${escapeHtml(label)}</th>${rechnungen.map((x) => `<td>${f(x)}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </div>
    </section>`;
}
