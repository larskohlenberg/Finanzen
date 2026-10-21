// app/uebersicht-modell.mjs
// Kennzahlen der Uebersicht als reine Funktion ueber einen Bestand: rechnet im
// App-Server (lese-api.mjs, GET /api/v1/uebersicht) mit denselben Modulen wie
// zuvor die Ansicht (uebersicht-rechnung, plan-ist, vermoegen,
// vorsorge-rechnung, fristen, absicherung). Zurueck geht nur, was die Kacheln
// zeigen: Summen, Namen und Ids, keine Rohlisten.
import { absicherung } from "./absicherung.mjs";
import { importAbdeckung } from "./klassifikation.mjs";
import { anstehendeFristen } from "./fristen.mjs";
import { anstehendeJahreszahlungen } from "./liquiditaet.mjs";
import { planIst } from "./plan-ist.mjs";
import { kontenGruppen, mittelVergleich, monatsMittel, vorjahresMittel } from "./uebersicht-rechnung.mjs";
import { aktuellerZeitwert } from "./bewertung.mjs";
import { computeNettovermoegen } from "./vermoegen.mjs";
import { gesetzlicherRentenbeginn, kapitalLeistungen, rentenStufen, tabFuerVorsorge, vertragsFarben } from "./vorsorge-rechnung.mjs";

export const HORIZONT_MONATE = 12;

// Name des Objekts, auf das eine Frist zeigt (Liste und Namensfeld je Typ).
const BEZUG_NAME = {
  vorsorge: ["vorsorge", "name"],
  darlehen: ["darlehen", "bezeichnung"],
  immobilie: ["immobilien", "bezeichnung"],
  vermoegenswert: ["vermoegenswerte", "bezeichnung"],
  konto: ["konten", "name"],
  regelzahlung: ["regelzahlungen", "bezeichnung"],
};

function bezugMitName(daten, bezug) {
  if (!bezug) return bezug;
  const [liste, feld] = BEZUG_NAME[bezug.typ] ?? [];
  const objekt = liste ? (daten[liste] ?? []).find((o) => o[`${bezug.typ}_id`] === bezug.id) : undefined;
  return { ...bezug, ...(objekt?.[feld] ? { name: objekt[feld] } : {}) };
}

const vertrag = (vs) => ({ vorsorge_id: vs?.vorsorge_id, name: vs?.name });

export function uebersichtModell(daten, heute) {
  const gruppen = kontenGruppen(daten, heute);
  // Nur Monate, die auf allen Konten vollstaendig gebucht sind (Importabdeckung
  // je Konto, dieselbe Monatsliste wie Plan & Ist).
  const abdeckung = importAbdeckung(daten, heute);
  const mittel = monatsMittel(daten, heute, { vollstaendigBis: abdeckung.vollstaendig_bis });
  const plan = mittel.anzahl_monate ? planIst(daten, mittel.monate) : null;

  const netto = computeNettovermoegen(daten, heute);
  const kontotyp = Object.fromEntries((daten.konten ?? []).map((k) => [k.konto_id, k.kontotyp]));
  // Rueckkaufswerte fuehren in den Vorsorge-Reiter, der den groessten Teil davon haelt.
  const jeTab = new Map();
  for (const p of netto.positionen.filter((p) => p.klasse === "vorsorge")) {
    const tab = tabFuerVorsorge((daten.vorsorge ?? []).find((vs) => vs.vorsorge_id === p.id));
    jeTab.set(tab, (jeTab.get(tab) ?? 0) + p.wert_cents);
  }
  // Was bei Ablauf aus dem Rueckkaufswert wird: Rente (faellt dann aus dem
  // Vermoegen) oder Kapital (bleibt als Guthaben), mit Leistungsbeginn.
  const rueckkaufVerwendung = Object.fromEntries(netto.positionen.filter((p) => p.klasse === "vorsorge").map((p) => {
    const vs = (daten.vorsorge ?? []).find((v) => v.vorsorge_id === p.id);
    const rente = vs?.kapitalwahl === "monatsrente" || Boolean(aktuellerZeitwert(daten.zeitwerte, "vorsorge", p.id, "erwartete_rente", heute));
    return [p.id, { art: rente ? "rente" : "kapital", beginn: vs?.leistung_beginn || null }];
  }));

  const { renten, stufen, gesamt_cents } = rentenStufen(daten);
  const kapital = kapitalLeistungen(daten, heute);
  const kontoName = new Map((daten.konten ?? []).map((k) => [k.konto_id, k.name]));

  return {
    heute,
    konten: {
      summe_cents: gruppen.konten.summe_cents,
      aeltester: gruppen.konten.aeltester,
      zeilen: gruppen.konten.zeilen.map(({ konto, zeile }) => ({ konto_id: konto.konto_id, name: konto.name, wert_cents: zeile.wert_cents })),
    },
    // Nur, was die Kacheln lesen (keine Einzelbuchungen der Sondereffekte, keine Monatsreihen).
    mittel: {
      monate: mittel.monate,
      anzahl_monate: mittel.anzahl_monate,
      von: mittel.von,
      bis: mittel.bis,
      einnahmen: { mittel_cents: mittel.einnahmen.mittel_cents, kategorien: mittel.einnahmen.kategorien },
      ausgaben: { mittel_cents: mittel.ausgaben.mittel_cents, kategorien: mittel.ausgaben.kategorien },
      sparen: mittel.sparen,
      // Umfang: welche Konten wie weit belegt sind; Ausschluesse: Anzahl und Summe je ausgeschlossener Klasse.
      umfang: abdeckung,
      ausschluesse: mittel.ausschluesse,
    },
    // Pfeile der Kacheln: letzte zwoelf Monate gegen die zwoelf davor (null ohne volle Vorjahresmonate).
    trend: mittelVergleich(mittel, vorjahresMittel(daten, mittel)),
    plan: plan ? {
      einnahmen_plan_cents: plan.einnahmen.plan_cents,
      ausgaben_plan_cents: plan.ausgaben.plan_cents,
      quote: plan.sparen.plan.quote,
    } : null,
    vermoegen: {
      netto_cents: netto.netto_cents,
      // fehlt: Position ohne Wert (Chip "bekannter Teilbestand" in der Kachel).
      positionen: netto.positionen.map(({ klasse, id, name, wert_cents, standdatum, fehlt }) => ({ klasse, id, name, wert_cents, standdatum, fehlt: Boolean(fehlt) })),
      kontotyp,
      rueckkauf_verwendung: rueckkaufVerwendung,
      rueckkauf_tab: [...jeTab].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "lebensversicherungen",
    },
    vorsorge: {
      renten: renten.map((l) => ({ ...vertrag(l.vorsorge), wert_cents: l.wert_cents })),
      stufen: stufen.map(({ datum, summe_cents }) => ({ datum, summe_cents })),
      gesamt_cents,
      farben: Object.fromEntries(vertragsFarben(daten)),
      gesetzlich: gesetzlicherRentenbeginn(daten),
      kapital: {
        terminiert: kapital.terminiert.map((l) => ({ ...vertrag(l.vorsorge), wert_cents: l.wert_cents, weiterzahlung_cents: l.weiterzahlung_cents, beginn: l.beginn, ersatz: Boolean(l.ersatz) })),
        jahre: kapital.jahre,
        terminiert_cents: kapital.terminiert_cents,
        terminiert_weiterzahlung_cents: kapital.terminiert_weiterzahlung_cents,
        nicht_faellig_cents: kapital.bedingt_cents + kapital.undatiert_cents,
      },
    },
    fristen: anstehendeFristen(daten, heute, HORIZONT_MONATE).map((f) => ({ ...f, bezug: bezugMitName(daten, f.bezug) })),
    zahlungen: anstehendeJahreszahlungen(daten.regelzahlungen, heute, HORIZONT_MONATE).map(({ datum, regelzahlung: rz }) => ({
      datum,
      regelzahlung: { regelzahlung_id: rz.regelzahlung_id, vorsorge_id: rz.vorsorge_id, bezeichnung: rz.bezeichnung, konto_id: rz.konto_id, betrag: rz.betrag },
      konto_name: rz.konto_id ? kontoName.get(rz.konto_id) ?? rz.konto_id : "",
    })),
    absicherung: absicherung(daten, heute),
  };
}
