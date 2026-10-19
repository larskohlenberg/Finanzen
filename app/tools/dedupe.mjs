// app/tools/dedupe.mjs
import { createHash } from "node:crypto";
import { normalizeWhitespace } from "./lib/text.mjs";

// Separator: NUL-Byte (siehe Plan/ADR 0007). Zur Laufzeit via fromCharCode
// erzeugt, damit der Quelltext reiner Text bleibt (kein binaeres NUL in der Datei).
const SEP = String.fromCharCode(0);

export function computeDedupeHash(entry) {
  const ref = String(entry.bank_referenz ?? "").trim();
  const parts = ref
    ? [entry.konto_id, ref]
    : [
        entry.konto_id,
        entry.buchungsdatum,
        entry.betrag,
        normalizeWhitespace(entry.gegenpartei),
        normalizeWhitespace(entry.verwendungszweck),
      ];
  return createHash("sha256").update(parts.join(SEP)).digest("hex");
}

// Zwei in allen Quellfeldern identische, aber real verschiedene Buchungen eines
// Auszugs (z. B. referenzlose Ruecklaeufer) ergeben denselben computeDedupeHash.
// Der Validator verlangt jedoch eindeutige dedupe_hashes. Fuer das n-te Vorkommen
// (n >= 2) wird der Basis-Hash deterministisch zu einem weiterhin 64-stelligen
// Hash disambiguiert. Buchungsinhalte bleiben unveraendert.
export function disambiguateHash(baseHash, occurrence) {
  return createHash("sha256").update(`${baseHash}${SEP}${occurrence}`).digest("hex");
}

// Hash fuer das n-te Vorkommen eines Inhalts (n = 1: der Grundschluessel).
export function vorkommenHash(inhaltsHash, n) {
  return n === 1 ? inhaltsHash : disambiguateHash(inhaltsHash, n);
}

// Schluessel des Buchungsinhalts: (Konto, Datum, Betrag, Gegenpartei, Zweck),
// unabhaengig von einer Bank-Referenz. Fuer Bestandszeilen aus ihren Feldern
// berechnet — so zaehlen auch Alt-Hashes mit, die aus (Konto, Referenz) oder
// als disambiguiertes Vorkommen gebildet wurden und sich nicht zurueckrechnen
// lassen.
export function inhaltsHash(eintrag) {
  return computeDedupeHash({ ...eintrag, bank_referenz: undefined });
}

const referenzVon = (x) => String(x?.bank_referenz ?? "").trim();
// So viele Vorkommen in Folge duerfen beim Suchen der Alt-Hashes fehlen (etwa
// von Hand entfernte Doppel), bevor die Suche endet.
const LUECKE = 3;

function anhaengen(map, schluessel, wert) {
  const liste = map.get(schluessel);
  if (liste) liste.push(wert);
  else map.set(schluessel, [wert]);
}

// Abgleich der Importzeilen mit dem Bestand als Multimenge (ADR 0034).
//
// 1. Referenz: Ist die Bank-Referenz auf dem Konto verlaesslich (kein Wert auf
//    zwei Buchungen, weder im Bestand noch in der Datei noch zwischen beiden),
//    ist eine Zeile mit derselben Referenz, demselben Datum und Betrag schon
//    da — auch bei umformatiertem Text (ADR 0007).
// 2. Inhalt: Die uebrigen Zeilen werden je (Konto, Inhalt) gezaehlt. Neu sind
//    max(Anzahl Datei - Anzahl Bestand, 0), in Dateireihenfolge die letzten.
//    Das setzt voraus, dass der Export den Tag vollstaendig enthaelt.
// 3. Unklares wird Prueffall statt still entschieden.
//
// eintraege: [{ row, entry }] (formal gueltig). Liefert je Zeile eine
// Entscheidung, dazu Prueffaelle und die Konten mit unverlaesslicher Referenz.
export function gleicheMitBestandAb(eintraege, transaktionen) {
  const nachHash = new Map(transaktionen.map((tx) => [tx.dedupe_hash, tx]));

  // --- Verlaesslichkeit der Referenz je Konto ---
  const bestandRef = new Map(); // konto -> ref -> [tx]
  for (const tx of transaktionen) {
    const ref = referenzVon(tx);
    if (!ref) continue;
    if (!bestandRef.has(tx.konto_id)) bestandRef.set(tx.konto_id, new Map());
    anhaengen(bestandRef.get(tx.konto_id), ref, tx);
  }
  const dateiRef = new Map(); // konto -> ref -> [entry]
  for (const { entry } of eintraege) {
    const ref = referenzVon(entry);
    if (!ref) continue;
    if (!dateiRef.has(entry.konto_id)) dateiRef.set(entry.konto_id, new Map());
    anhaengen(dateiRef.get(entry.konto_id), ref, entry);
  }
  const unverlaesslich = new Set();
  for (const konto of new Set([...bestandRef.keys(), ...dateiRef.keys()])) {
    const imBestand = bestandRef.get(konto) ?? new Map();
    const inDatei = dateiRef.get(konto) ?? new Map();
    const mehrfach = [...imBestand.values(), ...inDatei.values()].some((liste) => liste.length > 1);
    const widerspruch = [...inDatei].some(([ref, [e]]) => {
      const tx = imBestand.get(ref)?.[0];
      return tx && (tx.buchungsdatum !== e.buchungsdatum || tx.betrag !== e.betrag);
    });
    if (mehrfach || widerspruch) unverlaesslich.add(konto);
  }

  const entscheidung = new Map(); // row -> { neu } | { vorhanden: tx, grund }
  const verbraucht = new Set(); // transaktion_id

  // --- 1. Referenz ---
  for (const { row, entry } of eintraege) {
    const ref = referenzVon(entry);
    if (!ref || unverlaesslich.has(entry.konto_id)) continue;
    const tx = bestandRef.get(entry.konto_id)?.get(ref)?.[0];
    if (tx && !verbraucht.has(tx.transaktion_id)) {
      verbraucht.add(tx.transaktion_id);
      entscheidung.set(row, { vorhanden: tx, grund: "referenz" });
    }
  }

  // --- 2. Inhalt ---
  const dateiGruppen = new Map(); // inhalt -> [{row, entry}]
  for (const zeile of eintraege) {
    if (!entscheidung.has(zeile.row)) anhaengen(dateiGruppen, inhaltsHash(zeile.entry), zeile);
  }
  // Bestandszeilen, deren gespeicherter Hash ein Vorkommen dieses Inhalts ist,
  // gehoeren zu ihm — auch wenn ihr Text spaeter geaendert wurde.
  const gruppeVon = new Map(); // transaktion_id -> inhalt
  for (const [inhalt, zeilen] of dateiGruppen) {
    let gefunden = 0;
    for (let n = 1, fehlend = 0; n <= zeilen.length + gefunden || fehlend < LUECKE; n += 1) {
      const tx = nachHash.get(vorkommenHash(inhalt, n));
      if (tx) {
        gefunden += 1;
        fehlend = 0;
        if (!gruppeVon.has(tx.transaktion_id)) gruppeVon.set(tx.transaktion_id, inhalt);
      } else {
        fehlend += 1;
      }
    }
  }
  const bestandGruppen = new Map(); // inhalt -> [tx]
  for (const tx of transaktionen) {
    if (verbraucht.has(tx.transaktion_id)) continue;
    const inhalt = gruppeVon.get(tx.transaktion_id) ?? inhaltsHash(tx);
    if (dateiGruppen.has(inhalt)) anhaengen(bestandGruppen, inhalt, tx);
  }

  const pruefen = [];
  for (const [inhalt, zeilen] of dateiGruppen) {
    const bestand = bestandGruppen.get(inhalt) ?? [];
    const vorhanden = Math.min(zeilen.length, bestand.length);
    zeilen.forEach((zeile, i) => {
      entscheidung.set(zeile.row, i < vorhanden ? { vorhanden: bestand[i], grund: "inhalt" } : { neu: true, inhalt });
    });
    if (bestand.length > 0 && (zeilen.length > 1 || bestand.length > 1)) {
      pruefen.push({
        art: "teilweise_vorhanden",
        konto_id: zeilen[0].entry.konto_id,
        zeilen: zeilen.map((z) => z.row),
        in_datei: zeilen.length,
        im_bestand: bestand.length,
        geschrieben: zeilen.length - vorhanden,
        hinweis: "Gleiche Buchungen nach Anzahl abgeglichen; stimmt nur, wenn der Export diesen Tag vollstaendig enthaelt",
      });
    }
    // Verlaessliche, aber abweichende Referenz: nach Inhalt und Anzahl schon
    // da, nach Referenz eine andere Buchung.
    for (const [i, zeile] of zeilen.slice(0, vorhanden).entries()) {
      const ref = referenzVon(zeile.entry);
      const refBestand = referenzVon(bestand[i]);
      if (ref && refBestand && ref !== refBestand && !unverlaesslich.has(zeile.entry.konto_id)) {
        pruefen.push({
          art: "referenz_abweichend",
          konto_id: zeile.entry.konto_id,
          zeilen: [zeile.row],
          transaktion_id: bestand[i].transaktion_id,
          hinweis: "Inhalt gleich, Bank-Referenz verschieden — als vorhanden gezaehlt; ist es eine zweite Buchung, von Hand nachtragen",
        });
      }
    }
  }

  // Neue Zeile mit gleicher Referenz, gleichem Datum und Betrag wie eine
  // Bestandszeile, aber anderem Text, auf einem Konto ohne verlaessliche
  // Referenz: vielleicht ein umformatierter Re-Export.
  for (const { row, entry } of eintraege) {
    const ref = referenzVon(entry);
    if (!ref || !entscheidung.get(row)?.neu || !unverlaesslich.has(entry.konto_id)) continue;
    const tx = (bestandRef.get(entry.konto_id)?.get(ref) ?? []).find((t) => t.buchungsdatum === entry.buchungsdatum && t.betrag === entry.betrag);
    if (tx) {
      pruefen.push({
        art: "moegliche_dublette",
        konto_id: entry.konto_id,
        zeilen: [row],
        transaktion_id: tx.transaktion_id,
        hinweis: "Gleiche Referenz, Datum und Betrag wie eine Bestandsbuchung, anderer Text; Referenz auf diesem Konto nicht verlaesslich — geschrieben, bitte pruefen",
      });
    }
  }

  return { entscheidung, pruefen, referenz_unzuverlaessig: [...unverlaesslich].sort() };
}
