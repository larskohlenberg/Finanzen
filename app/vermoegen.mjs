// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./liquiditaet.mjs";
import { aktuellerZeitwert, darlehensplan, kontoStand, stand } from "./bewertung.mjs";
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

export function computeVermoegenChecks(data, today) {
  const checks = [];

  // Auch nicht-liquiditaetsrelevante Cash-Konten pruefen: sie fliessen via
  // kontoWert ins Nettovermoegen, also gelten Anker-Pflicht und Reconciliation dort genauso.
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen" || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand", today);
    if (!anker) {
      checks.push({ art: "anker-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: kein belegter Kontostand` });
      continue;
    }
    for (const d of reconciliationDrift(konto, data.zeitwerte, data.transaktionen, today)) {
      checks.push({ art: "reconciliation-drift", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: Buchungen passen nicht zum Kontoauszug ${d.bis} (erwartet ${(d.erwartet_cents / 100).toFixed(2)}, belegt ${(d.belegt_cents / 100).toFixed(2)})` });
    }
  }

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp !== "depot" || konto.status === "geschlossen") continue;
    const dw = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert", today);
    if (!dw) { checks.push({ art: "marktwert-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: kein Depotwert` }); continue; }
    const schwelle = standSchwelleMonate(konto, data.transaktionen, today);
    if (standVeraltet(konto, dw.standdatum, data.transaktionen, today)) {
      checks.push({ art: "bewertung-veraltet", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: Depotwert vom ${dw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: kein Marktwert` }); continue; }
    if (monateZwischen(mw.standdatum, today) >= STANDDATUM_SCHWELLEN.immobilie) {
      checks.push({ art: "bewertung-veraltet", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: Marktwert vom ${mw.standdatum} älter als ${STANDDATUM_SCHWELLEN.immobilie} Monate` });
    }
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: kein Marktwert` }); continue; }
    const schwelle = STANDDATUM_SCHWELLEN[`vermoegenswert_${vmw.typ}`] ?? 12;
    if (monateZwischen(mw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: Wert vom ${mw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld", today);
    // kein continue — fehlender Anker und fehlende Regelzahlung sind unabhängige Befunde
    if (!anker) checks.push({ art: "anker-fehlt", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: kein belegter Restschuldstand` });
    const hatRate = (data.regelzahlungen ?? []).some((rz) => rz.darlehen_id === dar.darlehen_id && rz.status === "bestaetigt");
    if (!hatRate) checks.push({ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: Rate nicht in der Liquiditätsprognose — Regelzahlung anlegen?` });
  }

  for (const vs of data.vorsorge ?? []) {
    if (vs.status === "beendet" || vs.status === "gekuendigt") continue;
    // Beitragsdynamik: Termin naht ohne Entscheidung, oder ein Angebot liegt vor.
    const dynamik = dynamikStand(vs, today);
    if (dynamik?.entscheidung_noetig) {
      const regel = dynamik.vorschlag ? ` — nach der Regel „nur jede dritte annehmen“: ${dynamik.vorschlag}${dynamik.letzte_chance ? " (ein weiterer Widerspruch beendet das Dynamikrecht)" : ""}` : " — Verlauf unvollständig, frühere Entscheidungen aus den Lastschriften klären";
      checks.push({ art: "vorsorge-dynamik", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Dynamik zum ${dynamik.naechster_termin} entscheiden${regel}` });
    }
    if (!vs.geprueft_am) {
      checks.push({ art: "vorsorge-ungeprueft", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: ungeprüfter Anspruch — darf nicht als sicherer Zukunftswert gelten` });
      continue;
    }

    // Jede Mitteilung zaehlt als Pruefung, auch eine mit reinen Absicherungswerten (BU, Tod).
    const felder = ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung", "vertragswert", "bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "beitragssumme"];
    let juengstes = vs.geprueft_am;
    for (const feld of felder) {
      const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
      if (zw && zw.standdatum > juengstes) juengstes = zw.standdatum;
    }

    if (monateZwischen(juengstes, today) >= STANDDATUM_SCHWELLEN.vorsorge) {
      checks.push({ art: "vorsorge-wiedervorlage", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: letzte Prüfung/Mitteilung vom ${juengstes} älter als ${STANDDATUM_SCHWELLEN.vorsorge} Monate — Werte verifizieren (z. B. Gesetzesänderung)` });
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
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Beitrag endet ${ende}, keine Nachfolge erkennbar — Wechsel oder bewusste Kündigung?` });
      continue;
    }

    const nachBeitragStart = (data.regelzahlungen ?? [])
      .filter((rz) => rz.vorsorge_id === nachfolger.vorsorge_id)
      .map((rz) => rz.anker_datum)
      .sort()[0];
    if (!nachBeitragStart || nachBeitragStart > addInterval(ende, "tag", 1)) {
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Deckungslücke — alt endet ${ende}, Nachfolge ${nachfolger.name} beginnt ${nachBeitragStart ?? "ohne Beitrag"}` });
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
      text: `Frist ${termin.frist_id} ${termin.bezeichnung}: fällig am ${termin.datum}, nicht erledigt — erledigen und erledigt_bis setzen`,
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
    .map((d) => ({ darlehen: d, plan: darlehensplan(d, data.zeitwerte, grenze) }))
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
