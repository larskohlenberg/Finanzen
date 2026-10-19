// app/uebersicht-rechnung.mjs
// Reine Rechnung hinter der Uebersicht: kein DOM, kein Modulzustand, der Bestand
// kommt als Argument. Die Uebersicht (ueber selektoren.mjs) und das MCP-Tool
// `kennzahlen` rufen dieselben Funktionen, damit beide gleich rechnen.
import { toCents } from "./tools/lib/text.mjs";
import { aktivAm } from "./bewertung.mjs";
import { ausschlussZaehler, buchungsKlasse, kategorienIndex, KATEGORIE_UNGEKLAERT } from "./klassifikation.mjs";
import { bestandsMonate } from "./plan-ist.mjs";
import { computeVermoegenChecks, kontoWert, standVeraltet } from "./vermoegen.mjs";

// Summe aller geladenen Buchungen eines Kontos (kein Anfangssaldo, kein Stichtag).
export function kontoSaldoGeladen(data, kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .reduce((sum, tx) => sum + toCents(tx.betrag), 0);
}

// KPI "Summe geladener Bewegungen": liquiditaetsrelevante Konten ohne Depots.
export function saldoGeladenerKonten(data) {
  const accountIds = data.konten
    .filter((konto) => konto.kontotyp !== "depot" && konto.liquiditaetsrelevant)
    .map((konto) => konto.konto_id);
  return data.transaktionen
    .filter((tx) => accountIds.includes(tx.konto_id))
    .reduce((sum, tx) => sum + toCents(tx.betrag), 0);
}

// Eine Zeile der Kontentabelle: Wert zum Stichtag aus derselben Rechnung wie das
// Nettovermoegen (Depot = Depotwert, sonst belegter Anker + Buchungen danach),
// dazu Qualitaet, Stichtag des Belegs und ob dieser Stand veraltet ist
// (Schwellen wie der Check bewertung-veraltet). wert_cents null = kein Zeitwert.
export function kontoZeile(data, konto, today) {
  const w = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
  return {
    wert_cents: w.wert_cents,
    qualitaet: w.qualitaet,
    belegdatum: w.standdatum ?? "",
    basis: w.basis,
    veraltet: w.wert_cents !== null && standVeraltet(konto, w.standdatum, data.transaktionen, today),
  };
}

// Konten, die ins "Verfuegbare Geld" der Uebersicht einfliessen (wie die
// Liquiditaet: geschlossene bis aktiv_bis).
export function istVerfuegbaresKonto(konto, today) {
  return konto.kontotyp !== "depot" && konto.kontotyp !== "bar" && konto.liquiditaetsrelevant === true && aktivAm(konto, "geschlossen", today);
}

function istOffenesDepot(konto, today) {
  return konto.kontotyp === "depot" && aktivAm(konto, "geschlossen", today);
}

function kontoGruppe(data, konten, today) {
  const zeilen = konten.map((konto) => ({ konto, zeile: kontoZeile(data, konto, today) }));
  const enthalten = zeilen.filter((z) => z.zeile.wert_cents !== null);
  return {
    zeilen,
    summe_cents: enthalten.reduce((summe, z) => summe + z.zeile.wert_cents, 0),
    belegt: enthalten.filter((z) => z.zeile.qualitaet === "belegt").length,
    gesamt: zeilen.length,
    aeltester: enthalten.map((z) => z.zeile.belegdatum).filter(Boolean).sort()[0] ?? "",
  };
}

// Kontentabelle in Bloecken: konten (Summe = Verfuegbares Geld, Kachel der
// Uebersicht), depots, weitere (nicht liquide, bar, geschlossen; ohne Summe).
export function kontenGruppen(data, today) {
  const sortiert = sortierteKonten(data, today);
  const verfuegbar = (k) => istVerfuegbaresKonto(k, today);
  const depot = (k) => istOffenesDepot(k, today);
  return {
    konten: kontoGruppe(data, sortiert.filter(verfuegbar), today),
    depots: kontoGruppe(data, sortiert.filter(depot), today),
    weitere: kontoGruppe(data, sortiert.filter((k) => !verfuegbar(k) && !depot(k)), today),
  };
}

// Stand eines Kontos zum Stichtag (Bewertungsstand): Datum des Depotwerts bzw.
// der letzten eingerechneten Buchung; nichts nach dem Stichtag.
export function kontoStandDatum(data, konto, today) {
  return kontoWert(konto, data.zeitwerte, data.transaktionen, today).standdatum || "";
}

export function kontoRang(konto) {
  if (konto.kontotyp === "giro") return 0;
  if (konto.kontotyp === "tagesgeld") return 1;
  if (konto.kontotyp === "festgeld") return 2;
  if (konto.kontotyp === "depot") return 3;
  return 4;
}

export function sortierteKonten(data, today) {
  const datum = new Map(data.konten.map((k) => [k.konto_id, kontoStandDatum(data, k, today)]));
  return data.konten.slice().sort((a, b) => {
    const rank = kontoRang(a) - kontoRang(b);
    if (rank !== 0) return rank;
    const dateCmp = datum.get(b.konto_id).localeCompare(datum.get(a.konto_id));
    if (dateCmp !== 0) return dateCmp;
    return a.name.localeCompare(b.name);
  });
}

export function vermoegenCheckItem(check) {
  return {
    scope: "vermoegen",
    severity: "review",
    title_key: `vermoegen.checkArt.${check.art}`,
    detail: check.text,
    entity_id: check.entitaet_id,
    entitaet: check.entitaet,
  };
}

export function checkItems(data, today) {
  return [
    ...data.checks,
    ...computeVermoegenChecks(data, today).map(vermoegenCheckItem),
  ];
}

// Check-Vorschau der Uebersicht: Review-Checks zuerst, dann der Rest.
export function checkVorschau(items, limit = 4) {
  return [
    ...items.filter((check) => check.severity === "review"),
    ...items.filter((check) => check.severity !== "review"),
  ].slice(0, limit);
}

// Rundet Cent-Betraege so auf ganze Euro, dass ihre Summe genau dem auf Euro
// gerundeten Ziel entspricht (groesste Reste zuerst). Ergebnis wieder in Cent.
export function verteileRundung(werteCents, zielCents) {
  const ziel = Math.round(zielCents / 100);
  const basis = werteCents.map((c) => Math.floor(c / 100));
  let rest = ziel - basis.reduce((a, b) => a + b, 0);
  const reihenfolge = werteCents.map((c, i) => ({ i, bruch: c / 100 - Math.floor(c / 100) }));
  reihenfolge.sort((a, b) => b.bruch - a.bruch || a.i - b.i);
  for (let k = 0; rest > 0 && reihenfolge.length; k = (k + 1) % reihenfolge.length, rest--) basis[reihenfolge[k].i] += 1;
  for (let k = reihenfolge.length - 1; rest < 0 && reihenfolge.length; k = (k - 1 + reihenfolge.length) % reihenfolge.length, rest++) basis[reihenfolge[k].i] -= 1;
  return basis.map((e) => e * 100);
}

// Monatliche Einnahmen, Ausgaben und Sparquote: Durchschnitt der letzten zwoelf
// vollstaendigen Monate, dieselbe Monatsliste wie Plan & Ist (bestandsMonate:
// ab dem letzten Startzustand, vor dem laufenden Monat, hoechstens bis zum
// letzten Monat, den alle Konten belegen). Welche Buchungen zaehlen, sagt die
// zentrale Klassifikation (klassifikation.mjs): Transfers, Startzustand,
// Investitionen und Sondereffekte nicht; sie stehen in `ausschluesse`.
// - Einnahme- und Ausgabenkategorien (auch "Noch zu klaeren" und Buchungen ohne
//   Kategorie) zaehlen netto je Kategorie: Ueberwiegen die Gutschriften (etwa
//   Steuererstattungen, Kindergeld), ist die Kategorie eine Einnahme, sonst eine
//   Ausgabe. Eine einzelne Erstattung mindert so nur ihre Kategorie.
// - Gutschriften einer Kategorie mit gutschriften_sondereffekt (Steuererstattung)
//   sind keine laufende Einnahme: sie stehen als Sondereffekt daneben.
// - Kategorien mit investition (Modernisierung samt Zuschuss) zaehlen gar nicht.
// - Kategorien mit brutto teilen nach Vorzeichen: Gutschriften als Einnahme,
//   Belastungen als Ausgabe (je eine Zeile unter derselben Kategorie).
// - Neutrale Kategorien sind keine Ausgaben. In der Sparquote zeigen die mit
//   sparziel "depot" bzw. "versicherung", was in Depots und Vertraege fliesst;
//   der Rest des Ueberschusses bleibt kurzfristig liquide (Konten, Tagesgeld,
//   Festgeld; negativ: aus Ruecklagen entnommen).
// Bei kuerzerer Historie wird nur durch die vorhandenen Monate geteilt.
// vollstaendigBis (importAbdeckung): ein Monat zaehlt erst, wenn alle Konten
// bis zu seinem letzten Tag belegt sind, sonst fehlen noch Buchungen.
export function monatsMittel(data, today, { vollstaendigBis = "" } = {}) {
  const monate = bestandsMonate(data, today, { vollstaendigBis }).slice(-12);
  const index = new Map(monate.map((m, i) => [m, i]));
  const typ = kategorienIndex(data);
  const istNeutral = (id) => typ.get(id)?.typ === "neutral" && id !== KATEGORIE_UNGEKLAERT;
  const sondereffekte = new Map();
  const investNetto = new Map();
  const ausschluesse = ausschlussZaehler();

  // Netto je Kategorie, gesamt und je Monat (Vorzeichen wie gebucht).
  const netto = new Map();
  for (const tx of data.transaktionen ?? []) {
    const i = index.get(tx.buchungsdatum?.slice(0, 7));
    if (i === undefined) continue;
    const id = tx.kategorie_id ?? "";
    const cents = toCents(tx.betrag);
    const klasse = buchungsKlasse(tx, typ);
    ausschluesse.zaehle(klasse, cents);
    if (klasse === "transfer" || klasse === "startzustand") continue;
    if (klasse === "investition") {
      investNetto.set(id, (investNetto.get(id) ?? 0) + cents);
      continue;
    }
    const key = typ.get(id)?.brutto === true ? `${id}${cents >= 0 ? "+" : "-"}` : id;
    if (klasse === "sondereffekt") {
      const se = sondereffekte.get(id) ?? { kategorie_id: id, name: typ.get(id).name, summe_cents: 0, buchungen: [] };
      se.summe_cents += cents;
      se.buchungen.push({ datum: tx.buchungsdatum, betrag_cents: cents });
      sondereffekte.set(id, se);
      continue;
    }
    const k = netto.get(key) ?? { kategorie_id: id, summe: 0, je_monat: monate.map(() => 0) };
    k.summe += cents;
    k.je_monat[i] += cents;
    netto.set(key, k);
  }

  const n = monate.length;
  const mittel = (summe) => (n ? Math.round(summe / n) : 0);
  const name = (id) => typ.get(id)?.name ?? id;
  const seite = (vorzeichen) => {
    const keys = [...netto].filter(([, k]) => !istNeutral(k.kategorie_id) && (vorzeichen > 0 ? k.summe >= 0 : k.summe < 0));
    const je_monat = monate.map((_, i) => keys.reduce((a, [, k]) => a + vorzeichen * k.je_monat[i], 0));
    return {
      mittel_cents: mittel(keys.reduce((a, [, k]) => a + vorzeichen * k.summe, 0)),
      je_monat,
      kategorien: keys
        .map(([, k]) => ({ kategorie_id: k.kategorie_id, name: name(k.kategorie_id), mittel_cents: mittel(vorzeichen * k.summe) }))
        .filter((k) => k.mittel_cents > 0)
        .sort((a, b) => b.mittel_cents - a.mittel_cents),
    };
  };
  const einnahmen = seite(1);
  const ausgaben = seite(-1);

  const ueberschuss = einnahmen.mittel_cents - ausgaben.mittel_cents;
  const zielSumme = (ziel) => mittel(0 - [...netto].filter(([id]) => istNeutral(id) && typ.get(id)?.sparziel === ziel).reduce((a, [, k]) => a + k.summe, 0));
  const depot = zielSumme("depot");
  const versicherung = zielSumme("versicherung");
  const zielKategorien = (ziel) => (data.kategorien ?? []).filter((k) => k.typ === "neutral" && k.sparziel === ziel).map((k) => k.kategorie_id);
  // Kurzfristig liquide in Teile: was in liquide Kategorien floss (Festgeld) und
  // der Rest auf Konten und Tagesgeld (negativ: dort entnommen).
  const liquide = ueberschuss - depot - versicherung;
  // Tatsaechliche Veraenderung je Konto (alle Buchungen samt Umbuchungen, ohne
  // Depots) erklaert den Rest; der Abgleich sind Sondereffekte, Investitionen u. Ae.
  const kontoMittel = new Map();
  const depotKonten = new Set((data.konten ?? []).filter((k) => k.kontotyp === "depot").map((k) => k.konto_id));
  let umbuchungen = 0;
  for (const tx of data.transaktionen ?? []) {
    if (!index.has(tx.buchungsdatum?.slice(0, 7))) continue;
    kontoMittel.set(tx.konto_id, (kontoMittel.get(tx.konto_id) ?? 0) + toCents(tx.betrag));
    if (tx.ist_transfer === true && !depotKonten.has(tx.konto_id)) umbuchungen += toCents(tx.betrag);
  }
  const konten = (data.konten ?? [])
    .filter((k) => k.kontotyp !== "depot" && kontoMittel.has(k.konto_id))
    .map((k) => ({ konto_id: k.konto_id, name: k.name, mittel_cents: mittel(kontoMittel.get(k.konto_id)) }))
    .filter((k) => k.mittel_cents !== 0)
    .sort((a, b) => b.mittel_cents - a.mittel_cents);
  const liquideTeile = zielKategorien("liquide")
    .map((id) => ({ kategorie_id: id, name: name(id), mittel_cents: mittel(0 - (netto.get(id)?.summe ?? 0)) }))
    .filter((k) => k.mittel_cents !== 0);
  const sparen = {
    ueberschuss_cents: ueberschuss,
    quote: einnahmen.mittel_cents > 0 ? ueberschuss / einnahmen.mittel_cents : null,
    ziele: [
      (() => {
        const konten_cents = liquide - liquideTeile.reduce((a, k) => a + k.mittel_cents, 0);
        const veraenderung_cents = konten.reduce((a, k) => a + k.mittel_cents, 0);
        // Was auf den Konten liegt, aber nicht aus dem laufenden Ueberschuss kommt:
        // Vorzeichen so, dass Veraenderung + Bestandteile = konten_cents.
        const bestandteile = [
          ...[...sondereffekte.values()].map((se) => ({ art: "sondereffekt", kategorie_id: se.kategorie_id, name: se.name, mittel_cents: 0 - mittel(se.summe_cents) })),
          ...[...investNetto].map(([id, summe]) => ({ art: "investition", kategorie_id: id, name: name(id), mittel_cents: 0 - mittel(summe) })),
          ...[...netto.values()].filter((k) => istNeutral(k.kategorie_id) && !typ.get(k.kategorie_id)?.sparziel).map((k) => ({ art: "neutral", kategorie_id: k.kategorie_id, name: name(k.kategorie_id), mittel_cents: 0 - mittel(k.summe) })),
          { art: "umbuchungen", mittel_cents: 0 - mittel(umbuchungen) },
        ].filter((b) => b.mittel_cents !== 0);
        const rest = konten_cents - veraenderung_cents - bestandteile.reduce((a, b) => a + b.mittel_cents, 0);
        // Rundungscent aus den Monatsmitteln erst ab einem Euro zeigen.
        if (Math.abs(rest) >= 100) bestandteile.push({ art: "rest", mittel_cents: rest });
        return { ziel: "liquide", mittel_cents: liquide, kategorien: [], teile: liquideTeile, konten_cents, konten, veraenderung_cents, bestandteile, abgleich_cents: konten_cents - veraenderung_cents };
      })(),
      { ziel: "depot", mittel_cents: depot, kategorien: zielKategorien("depot") },
      { ziel: "versicherung", mittel_cents: versicherung, kategorien: zielKategorien("versicherung") },
    ],
  };

  const letzterTag = n ? new Date(Date.UTC(Number(monate.at(-1).slice(0, 4)), Number(monate.at(-1).slice(5, 7)), 0)).toISOString().slice(0, 10) : "";
  return {
    monate,
    anzahl_monate: n,
    von: n ? `${monate[0]}-01` : "",
    bis: letzterTag,
    einnahmen,
    ausgaben,
    sparen,
    sondereffekte: [...sondereffekte.values()],
    ausschluesse: ausschluesse.ergebnis(),
  };
}

// Trend der monatlichen Einnahmen und Ausgaben: gleitendes 12-Monats-Mittel.
// Je voll abgeschlossenem Monat M das Mittel der zwoelf Monate bis M, gerechnet
// mit monatsMittel (gleiche Regeln wie die Kacheln; der letzte Punkt ist ihr
// Wert). Jede Jahreszahlung steckt so in jedem Fenster genau einmal, die Kurve
// bleibt ruhig. Der Pfeil vergleicht die letzten zwoelf Monate mit den zwoelf
// davor; seitwaerts, solange sich weniger als 5 Prozent oder weniger als 20 Euro
// je Monat aendern.
export const TREND_SCHWELLE_ANTEIL = 0.05;
export const TREND_SCHWELLE_CENTS = 2000;

const monatPlus = (ym, n) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

export function trendVergleich(aktuellCents, vorherCents) {
  const aenderung = aktuellCents - vorherCents;
  const anteil = vorherCents > 0 ? aenderung / vorherCents : null;
  const klein = Math.abs(aenderung) < TREND_SCHWELLE_CENTS || (anteil !== null && Math.abs(anteil) < TREND_SCHWELLE_ANTEIL);
  return { aktuell_cents: aktuellCents, vorher_cents: vorherCents, aenderung_cents: aenderung, anteil, richtung: klein ? "seitwaerts" : aenderung > 0 ? "hoch" : "runter" };
}

// Das Fenster, das zwoelf Monate vor dem von `jetzt` endet (die zwoelf Monate davor).
export function vorjahresMittel(data, jetzt) {
  if (!jetzt.anzahl_monate) return null;
  return monatsMittel(data, `${monatPlus(jetzt.monate.at(-1), -11)}-01`);
}

// Letzte zwoelf Monate gegen die zwoelf davor: Summen, je Kategorie (nach
// kategorie_id, je Seite) und die Sparquote in Prozentpunkten. Null, solange
// eines der beiden Fenster keine vollen zwoelf Monate hat.
export function mittelVergleich(jetzt, vorher) {
  if (!jetzt || !vorher || jetzt.anzahl_monate < 12 || vorher.anzahl_monate < 12) return null;
  const seite = (s) => {
    const alt = new Map(vorher[s].kategorien.map((k) => [k.kategorie_id, k.mittel_cents]));
    return {
      summe: trendVergleich(jetzt[s].mittel_cents, vorher[s].mittel_cents),
      kategorien: Object.fromEntries(jetzt[s].kategorien.map((k) => [k.kategorie_id, trendVergleich(k.mittel_cents, alt.get(k.kategorie_id) ?? 0)])),
    };
  };
  const q = jetzt.sparen.quote;
  const qAlt = vorher.sparen.quote;
  return {
    einnahmen: seite("einnahmen"),
    ausgaben: seite("ausgaben"),
    sparquote: { quote: q, vorher_quote: qAlt, aenderung_pp: q === null || qAlt === null ? null : Math.round((q - qAlt) * 1000) / 10 },
  };
}

// Verlauf fuer die Liquiditaetsseite: bis zu `punkte` Monate mit vollem Fenster,
// je Seite das Mittel und der Monatswert, je Kategorie die Mittel-Reihe, dazu
// die Sparquote und der Vergleich mit den zwoelf Monaten davor.
export function monatsTrend(data, today, { vollstaendigBis = "", punkte = 24 } = {}) {
  const jetzt = monatsMittel(data, today, { vollstaendigBis });
  const fenster = [];
  if (jetzt.anzahl_monate) {
    const ende = jetzt.monate.at(-1);
    for (let k = punkte - 1; k >= 0; k--) {
      const m = monatPlus(ende, -k);
      const r = k === 0 ? jetzt : monatsMittel(data, `${monatPlus(m, 1)}-01`);
      // Monate ohne Buchung und Fenster mit kurzer Historie fallen weg.
      if (r.monate.at(-1) === m && r.anzahl_monate === 12) fenster.push({ monat: m, r });
    }
  }
  const vorher = fenster.find((f) => f.monat === monatPlus(jetzt.monate.at(-1) ?? "0000-01", -12))?.r ?? (jetzt.anzahl_monate ? vorjahresMittel(data, jetzt) : null);
  const reihe = (s) => ({
    mittel_cents: fenster.map((f) => f.r[s].mittel_cents),
    monat_cents: fenster.map((f) => f.r[s].je_monat.at(-1)),
  });
  const kategorien = (s) => jetzt[s].kategorien.map((k) => ({
    kategorie_id: k.kategorie_id,
    name: k.name,
    mittel_cents: fenster.map((f) => f.r[s].kategorien.find((x) => x.kategorie_id === k.kategorie_id)?.mittel_cents ?? 0),
  }));
  return {
    monate: fenster.map((f) => f.monat),
    von: jetzt.von,
    bis: jetzt.bis,
    einnahmen: reihe("einnahmen"),
    ausgaben: reihe("ausgaben"),
    sparquote: fenster.map((f) => f.r.sparen.quote),
    kategorien: { einnahmen: kategorien("einnahmen"), ausgaben: kategorien("ausgaben") },
    vergleich: mittelVergleich(jetzt, vorher),
    ausschluesse: jetzt.ausschluesse,
  };
}
