// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./liquiditaet.mjs";
import { aktuellerZeitwert, darlehensplan, ENDSTATUS, kontoStand, letzterBekannterStand, stand } from "./bewertung.mjs";
import { darlehensRegelzahlungen } from "./darlehen.mjs";
import { dynamikStand } from "./vorsorge-dynamik.mjs";
import { anstehendeFristen } from "./fristen.mjs";

// Bewertung zum Stichtag liegt in bewertung.mjs (gemeinsamer Stand fuer alle
// Ansichten); die Namen bleiben hier fuer bestehende Aufrufer erhalten.
export { aktuellerZeitwert, anteilWertCents, darlehensplan, faelligkeiten, gesamtQualitaet, restschuldHeute } from "./bewertung.mjs";
export { kontoStand as kontoWert };

export const STANDDATUM_SCHWELLEN = {
  immobilie: 12,
  vorsorge: 12,
  vermoegenswert_edelmetall: 6,
  vermoegenswert_beteiligung: 12,
  vermoegenswert_sonstiges: 12,
  depot_aktiv: 1,
  depot_ruhig: 3,
  konto: 1,
};

function monateZwischen(vonIso, bisIso) {
  const [vy, vm, vd] = vonIso.split("-").map(Number);
  const [by, bm, bd] = bisIso.split("-").map(Number);
  let m = (by - vy) * 12 + (bm - vm);
  if (bd < vd) m -= 1;
  return m;
}

function hatDepotBewegungLetztenMonat(kontoId, transaktionen, today) {
  const grenze = addInterval(today, "monat", -1);
  return (transaktionen ?? []).some((tx) => tx.konto_id === kontoId && tx.buchungsdatum > grenze && tx.buchungsdatum <= today);
}

// Ab wie vielen Monaten der Stand eines Kontos als veraltet gilt: Depot mit
// Bewegung im letzten Monat 1, ruhiges Depot 3, alle anderen Konten 1.
export function standSchwelleMonate(konto, transaktionen, today) {
  if (konto.kontotyp !== "depot") return STANDDATUM_SCHWELLEN.konto;
  return hatDepotBewegungLetztenMonat(konto.konto_id, transaktionen, today)
    ? STANDDATUM_SCHWELLEN.depot_aktiv
    : STANDDATUM_SCHWELLEN.depot_ruhig;
}

export function standVeraltet(konto, standdatum, transaktionen, today) {
  if (!standdatum) return false;
  return monateZwischen(standdatum, today) >= standSchwelleMonate(konto, transaktionen, today);
}

// Nettovermoegen zum Stichtag: der gemeinsame Bewertungsstand (bewertung.mjs).
export function computeNettovermoegen(data, today) {
  return stand(data, today);
}

// Reconciliation über aufeinanderfolgende belegte Stände eines Kontos: Anker plus
// Buchungen bis zum nächsten Anker muss den nächsten Anker ergeben. Liefert jede
// Abweichung (nur Staende bis `bis`, falls gesetzt); leer heißt, die Kette geht auf. Genutzt von den Vermögens-Checks
// und vom Prüfbericht (tools/pruefbericht.mjs).
export function reconciliationDrift(konto, zeitwerte, transaktionen, bis = null) {
  const staende = (zeitwerte ?? [])
    .filter((z) => z.entitaet === "konto" && z.entitaet_id === konto.konto_id && z.feld === "kontostand" && z.qualitaet === "belegt" && (!bis || z.standdatum <= bis))
    .sort((a, b) => a.standdatum.localeCompare(b.standdatum));
  const drift = [];
  for (let i = 1; i < staende.length; i++) {
    const von = staende[i - 1], bis = staende[i];
    let gebucht = 0;
    for (const tx of transaktionen ?? []) {
      if (tx.konto_id !== konto.konto_id) continue;
      if (tx.buchungsdatum > von.standdatum && tx.buchungsdatum <= bis.standdatum) gebucht += toCents(tx.betrag);
    }
    const erwartet = toCents(von.wert) + gebucht;
    const belegt = toCents(bis.wert);
    if (erwartet !== belegt) {
      drift.push({ konto_id: konto.konto_id, von: von.standdatum, bis: bis.standdatum, erwartet_cents: erwartet, belegt_cents: belegt, differenz_cents: belegt - erwartet });
    }
  }
  return drift;
}

// Pruefbefunde der Vermoegensrechnung als strukturierte Werte: art (Code),
// entitaet und entitaet_id (Objekt), name, dazu je Art Betraege in Cent und
// Daten als ISO-Text. Saetze baut erst die Anzeige (check-texte.mjs).
export function computeVermoegenChecks(data, today) {
  const checks = [];

  // Beendet ohne Enddatum: zaehlt nur bis zum letzten bekannten Stand (bewertung.mjs).
  const sammlungen = [["konto", data.konten, "konto_id", "name"], ["immobilie", data.immobilien, "immobilie_id", "bezeichnung"], ["vermoegenswert", data.vermoegenswerte, "vermoegenswert_id", "bezeichnung"], ["vorsorge", data.vorsorge, "vorsorge_id", "name"], ["darlehen", data.darlehen, "darlehen_id", "bezeichnung"]];
  for (const [entitaet, liste, idFeld, nameFeld] of sammlungen) {
    const ende = [ENDSTATUS[entitaet]].flat();
    for (const obj of liste ?? []) {
      if (!ende.includes(obj.status) || obj.aktiv_bis) continue;
      checks.push({ art: "enddatum-fehlt", entitaet, entitaet_id: obj[idFeld], name: obj[nameFeld], letzter_stand: letzterBekannterStand(data, entitaet, obj[idFeld]) });
    }
  }

  // Auch nicht-liquiditaetsrelevante Cash-Konten pruefen: sie fliessen via
  // kontoWert ins Nettovermoegen, also gelten Anker-Pflicht und Reconciliation dort genauso.
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen" || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand", today);
    if (!anker) {
      checks.push({ art: "anker-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, name: konto.name });
      continue;
    }
    for (const d of reconciliationDrift(konto, data.zeitwerte, data.transaktionen, today)) {
      checks.push({ art: "reconciliation-drift", entitaet: "konto", entitaet_id: konto.konto_id, name: konto.name, von: d.von, bis: d.bis, erwartet_cents: d.erwartet_cents, belegt_cents: d.belegt_cents, differenz_cents: d.differenz_cents });
    }
  }

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp !== "depot" || konto.status === "geschlossen") continue;
    const dw = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert", today);
    if (!dw) { checks.push({ art: "marktwert-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, name: konto.name }); continue; }
    const schwelle = standSchwelleMonate(konto, data.transaktionen, today);
    if (standVeraltet(konto, dw.standdatum, data.transaktionen, today)) {
      checks.push({ art: "bewertung-veraltet", entitaet: "konto", entitaet_id: konto.konto_id, name: konto.name, standdatum: dw.standdatum, schwelle_monate: schwelle });
    }
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "immobilie", entitaet_id: imm.immobilie_id, name: imm.bezeichnung }); continue; }
    if (monateZwischen(mw.standdatum, today) >= STANDDATUM_SCHWELLEN.immobilie) {
      checks.push({ art: "bewertung-veraltet", entitaet: "immobilie", entitaet_id: imm.immobilie_id, name: imm.bezeichnung, standdatum: mw.standdatum, schwelle_monate: STANDDATUM_SCHWELLEN.immobilie });
    }
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, name: vmw.bezeichnung }); continue; }
    const schwelle = STANDDATUM_SCHWELLEN[`vermoegenswert_${vmw.typ}`] ?? 12;
    if (monateZwischen(mw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, name: vmw.bezeichnung, standdatum: mw.standdatum, schwelle_monate: schwelle });
    }
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld", today);
    // kein continue — fehlender Anker und fehlende Regelzahlung sind unabhängige Befunde
    if (!anker) checks.push({ art: "anker-fehlt", entitaet: "darlehen", entitaet_id: dar.darlehen_id, name: dar.bezeichnung });
    const hatRate = (data.regelzahlungen ?? []).some((rz) => rz.darlehen_id === dar.darlehen_id && rz.status === "bestaetigt");
    if (!hatRate) checks.push({ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, name: dar.bezeichnung });
    // Die Regelzahlung bestimmt Rate und Tilgung (darlehen.mjs); weicht ihr
    // Betrag heute von der Sollrate ab, ist eins von beiden zu pruefen.
    for (const rz of darlehensRegelzahlungen(dar, data.regelzahlungen)) {
      if (rz.anker_datum > today || (rz.aktiv_bis && rz.aktiv_bis < today)) continue;
      const rate = Math.abs(toCents(rz.betrag));
      if (rate !== toCents(dar.sollrate)) checks.push({ art: "darlehen-rate-abweichung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, name: dar.bezeichnung, regelzahlung_id: rz.regelzahlung_id, rate_cents: rate, sollrate_cents: toCents(dar.sollrate) });
    }
  }

  for (const vs of data.vorsorge ?? []) {
    if (vs.status === "beendet" || vs.status === "gekuendigt") continue;
    // Beitragsdynamik: Termin naht ohne Entscheidung, oder ein Angebot liegt vor.
    const dynamik = dynamikStand(vs, today);
    if (dynamik?.entscheidung_noetig) {
      checks.push({ art: "vorsorge-dynamik", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, name: vs.name, termin: dynamik.naechster_termin, vorschlag: dynamik.vorschlag ?? null, letzte_chance: Boolean(dynamik.letzte_chance) });
    }
    if (!vs.geprueft_am) {
      checks.push({ art: "vorsorge-ungeprueft", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, name: vs.name });
      continue;
    }

    // Jede Mitteilung zaehlt als Pruefung, auch eine mit reinen Absicherungswerten (BU, Tod).
    const felder = ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung", "beitragsfreie_kapitalleistung", "vertragswert", "bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "waisenrente", "beitragssumme"];
    let juengstes = vs.geprueft_am;
    for (const feld of felder) {
      const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
      if (zw && zw.standdatum > juengstes) juengstes = zw.standdatum;
    }

    if (monateZwischen(juengstes, today) >= STANDDATUM_SCHWELLEN.vorsorge) {
      checks.push({ art: "vorsorge-wiedervorlage", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, name: vs.name, standdatum: juengstes, schwelle_monate: STANDDATUM_SCHWELLEN.vorsorge });
    }
  }

  const wechselHorizont = addInterval(today, "monat", 24);
  for (const vs of data.vorsorge ?? []) {
    let ende = null;
    for (const rz of data.regelzahlungen ?? []) {
      if (rz.vorsorge_id !== vs.vorsorge_id || !rz.aktiv_bis) continue;
      if (rz.aktiv_bis > today && rz.aktiv_bis <= wechselHorizont) {
        if (!ende || rz.aktiv_bis > ende) ende = rz.aktiv_bis;
      }
    }
    if (!ende) continue;

    const nachfolger = (data.vorsorge ?? []).find((v) => v.vorsorge_id !== vs.vorsorge_id && v.ersetzt_vorsorge_id === vs.vorsorge_id);
    if (!nachfolger) {
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, name: vs.name, fall: "ohne-nachfolge", ende });
      continue;
    }

    const nachBeitragStart = (data.regelzahlungen ?? [])
      .filter((rz) => rz.vorsorge_id === nachfolger.vorsorge_id)
      .map((rz) => rz.anker_datum)
      .sort()[0];
    if (!nachBeitragStart || nachBeitragStart > addInterval(ende, "tag", 1)) {
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, name: vs.name, fall: "deckungsluecke", ende, nachfolger_id: nachfolger.vorsorge_id, nachfolger_name: nachfolger.name, beginn: nachBeitragStart ?? null });
    }
  }

  // Ueberfaellige, nicht abgehakte Fristen (ADR 0031). Der Link fuehrt zum
  // Objekt der Frist; ohne Bezug traegt der Check die Frist-ID.
  for (const termin of anstehendeFristen(data, today, 0)) {
    if (!termin.ueberfaellig) continue;
    checks.push({
      art: "frist-ueberfaellig",
      entitaet: termin.bezug?.typ ?? "frist",
      entitaet_id: termin.bezug?.id ?? termin.frist_id,
      frist_id: termin.frist_id,
      name: termin.bezeichnung,
      datum: termin.datum,
    });
  }

  return checks;
}

// ------------------------------------------------------------- Verlaeufe

// Summen des Bewertungsstands zum Stichtag (fuer den Verlauf), dazu die Zahl
// unbekannter Positionen: Netto(d) = Verlauf(d) per Konstruktion.
export function nettovermoegenAm(data, datum) {
  const s = stand(data, datum);
  return { datum, aktiva_cents: s.aktiva_cents, passiva_cents: s.passiva_cents, netto_cents: s.netto_cents, unbekannt: s.unbekannt };
}

const monatsEnde = (monat) => addInterval(addInterval(`${monat}-01`, "monat", 1), "tag", -1);

// Nettovermoegen je Monatsende ab dem Monat der ersten Buchung (ohne Buchungen
// ab dem ersten Zeitwert), der laufende Monat zum heutigen Tag.
export function nettovermoegenVerlauf(data, today) {
  let erste = null;
  for (const tx of data.transaktionen ?? []) if (tx.buchungsdatum <= today && (!erste || tx.buchungsdatum < erste)) erste = tx.buchungsdatum;
  if (!erste) for (const z of data.zeitwerte ?? []) if (z.standdatum <= today && (!erste || z.standdatum < erste)) erste = z.standdatum;
  if (!erste) return [];
  const punkte = [];
  for (let monat = erste.slice(0, 7); monat <= today.slice(0, 7); monat = addInterval(`${monat}-01`, "monat", 1).slice(0, 7)) {
    const datum = monat === today.slice(0, 7) ? today : monatsEnde(monat);
    punkte.push({ monat, ...nettovermoegenAm(data, datum) });
  }
  return punkte;
}

// Restschuld aller laufenden Darlehen je Jahresende, von heute bis alle getilgt
// sind (Fortschreibung mit der heutigen Rate, auch ueber die Zinsbindung hinaus;
// laeuft ein Darlehen nie aus, endet die Reihe nach 40 Jahren). Dazu je Darlehen
// Zinsbindungsende und Tilgungsende als Ereignis. Ohne Darlehen mit Anker null.
export function restschuldJahre(data, today) {
  const start = Number(today.slice(0, 4));
  const grenze = `${start + 40}-12-31`;
  const plaene = (data.darlehen ?? [])
    .filter((d) => d.status !== "abgeloest")
    .map((d) => ({ darlehen: d, plan: darlehensplan(d, data.zeitwerte, grenze, data.regelzahlungen) }))
    .filter((x) => x.plan);
  if (!plaene.length) return null;
  const ereignisse = [];
  let ende = start;
  for (const { darlehen, plan } of plaene) {
    const frei = plan.raten.find((r) => r.rest_cents <= 0)?.datum ?? null;
    ende = Math.max(ende, Number((frei ?? grenze).slice(0, 4)));
    if (darlehen.zinsbindung_bis && darlehen.zinsbindung_bis >= today) ereignisse.push({ datum: darlehen.zinsbindung_bis, typ: "zinsbindung", darlehen });
    if (frei) ereignisse.push({ datum: frei, typ: "frei", darlehen });
  }
  const jahre = [];
  for (let j = start; j <= ende; j++) jahre.push(j);
  const restBis = ({ plan }, datum) => {
    let rest = toCents(plan.anker.wert);
    for (const r of plan.raten) if (r.datum <= datum) rest = r.rest_cents;
    return rest;
  };
  const rest = jahre.map((j) => plaene.reduce((a, x) => a + restBis(x, `${j}-12-31`), 0));
  ereignisse.sort((a, b) => a.datum.localeCompare(b.datum));
  const freiAb = ereignisse.filter((e) => e.typ === "frei").length === plaene.length ? ereignisse.filter((e) => e.typ === "frei").at(-1).datum : null;
  return { jahre, rest, ereignisse, frei_ab: freiAb };
}
