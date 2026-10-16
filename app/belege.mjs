// app/belege.mjs
// Reine Funktionen rund um die Dateien unter Belege/ (in der Oberflaeche
// "Dokumente"): Pfade aus Datenfeldern lesen, Ordnerbaum, Textzwillinge,
// Verweis-Index Datei -> Datensaetze, Sortierung/Suche, Routen.
// Kein DOM, kein runtime-Import: in Node direkt testbar (tests/belege.test.mjs).

import { vermoegenRoute } from "./vermoegen-routen.mjs";

export const BELEGE_WURZEL = "Belege";
const OCR_KOPF = "# Kein Textlayer";

// Belegpfad in einem Freitext (rohquelle, quelle_hinweis). Gierig bis zur
// letzten passenden Endung, damit "a.pdf.txt" ganz erfasst wird; Leerraum,
// Anfuehrungszeichen, Komma, Semikolon und Klammern beenden den Pfad,
// ein Satzpunkt am Ende faellt durch das Endungs-Lookahead heraus.
const PFAD_MUSTER = /Belege\/[^\s"'`;,()<>]+\.(?:pdf|csv|xlsx|xls|txt|png|jpe?g|heic|heif)(?![\p{L}\p{N}_-])/giu;

// Bildformate unter Belege/ (Fotos von Belegen). Sie haben wie PDFs einen
// Textzwilling, meist per OCR.
const BILD_TYPEN = new Set(["png", "jpg", "jpeg", "heic", "heif"]);
export function istBildTyp(typ) {
  return BILD_TYPEN.has(String(typ ?? "").toLowerCase());
}
const hatZwilling = (typ) => typ === "pdf" || istBildTyp(typ);

export function belegSchluessel(pfad) {
  return String(pfad ?? "").normalize("NFC");
}

// Ordnerverweis in einem Freitext: Pfad mit Schraegstrich am Ende, mindestens
// bis zur Objektebene (Belege/<Klasse>/<Objekt>/). So kann ein Stammsatz einen
// ganzen Belegordner nennen, z. B. eine Versicherung ihren Vertragsordner.
const ORDNER_MUSTER = /Belege\/[^\s"'`;,()<>]+\/(?=[\s"'`;,()<>]|$)/gu;

export function belegOrdnerAusText(text) {
  if (typeof text !== "string" || !text.includes("Belege/")) return [];
  const ordner = (text.match(ORDNER_MUSTER) ?? []).filter((o) => o.split("/").filter(Boolean).length >= 3);
  return [...new Set(ordner)];
}

export function belegPfadeAusText(text) {
  if (typeof text !== "string" || !text.includes("Belege/")) return [];
  return [...new Set(text.match(PFAD_MUSTER) ?? [])];
}

// Freitext -> HTML: alles escaped, Belegpfade als Link auf ihre Dokument-Route.
export function belegTextHtml(text, { titel, escape }) {
  const roh = String(text ?? "");
  let html = "";
  let pos = 0;
  for (const treffer of roh.matchAll(PFAD_MUSTER)) {
    html += escape(roh.slice(pos, treffer.index));
    html += `<a class="linkish quelldokument-link" href="${escape(dokumentRoute(treffer[0]))}" title="${escape(titel)}">${escape(treffer[0])}</a>`;
    pos = treffer.index + treffer[0].length;
  }
  return html + escape(roh.slice(pos));
}

// --- Pfade und Routen --------------------------------------------------------

function relativ(pfad) {
  const p = String(pfad ?? "");
  if (p === BELEGE_WURZEL) return "";
  return p.startsWith(`${BELEGE_WURZEL}/`) ? p.slice(BELEGE_WURZEL.length + 1) : p;
}

export function kodierePfad(rel) {
  return rel.split("/").map(encodeURIComponent).join("/");
}

export function dokumentRoute(pfad) {
  const rel = relativ(pfad);
  return rel ? `#/dokumente/${kodierePfad(rel)}` : "#/dokumente";
}

// Bereits dekodierter Routen-Rest -> App-relativer Pfad.
export function belegPfadAusRoute(rest) {
  return rest ? `${BELEGE_WURZEL}/${rest}` : "";
}

// URL zum Ausliefern der Datei (App-relativ, Segmente kodiert).
export function dateiUrl(pfad) {
  return kodierePfad(String(pfad ?? ""));
}

export function ordnerVon(pfad) {
  const i = pfad.lastIndexOf("/");
  return i > 0 ? pfad.slice(0, i) : BELEGE_WURZEL;
}

export function vorfahren(ordner) {
  const teile = ordner.split("/");
  return teile.map((_, i) => teile.slice(0, i + 1).join("/"));
}

function dateiName(pfad) {
  return pfad.slice(pfad.lastIndexOf("/") + 1);
}

function ohneEndung(pfad) {
  const punkt = pfad.lastIndexOf(".");
  return punkt > pfad.lastIndexOf("/") ? pfad.slice(0, punkt) : pfad;
}

// --- Zwillinge und Baum --------------------------------------------------------

// Reichert die flache API-Liste an: name, ordner, Textstatus der PDFs
// ("durchsuchbar" | "ocr-ausstehend" | ""), Zwillingsbezug in beide Richtungen.
export function ordneZwillingeZu(liste) {
  const txtNachBasis = new Map();
  const pdfNachBasis = new Map();
  for (const d of liste) {
    const basis = belegSchluessel(ohneEndung(d.pfad));
    if (d.typ === "txt") txtNachBasis.set(basis, d);
    if (hatZwilling(d.typ) && !pdfNachBasis.has(basis)) pdfNachBasis.set(basis, d);
  }
  return liste.map((d) => {
    const basis = belegSchluessel(ohneEndung(d.pfad));
    const eintrag = { ...d, name: dateiName(d.pfad), ordner: ordnerVon(d.pfad), textStatus: "", zwilling: "", istZwilling: false, zwillingVon: "" };
    if (hatZwilling(d.typ)) {
      const txt = txtNachBasis.get(basis);
      if (txt) {
        eintrag.zwilling = txt.pfad;
        eintrag.textStatus = txt.ocrAusstehend ? "ocr-ausstehend" : "durchsuchbar";
      }
    }
    if (d.typ === "txt") {
      const pdf = pdfNachBasis.get(basis);
      if (pdf) {
        eintrag.istZwilling = true;
        eintrag.zwillingVon = pdf.pfad;
      }
    }
    return eintrag;
  });
}

export function istOcrKopf(text) {
  return String(text ?? "").startsWith(OCR_KOPF);
}

const vergleiche = (a, b) => a.localeCompare(b, "de", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

// Ordnerbaum aus der flachen Liste. anzahl = Dateien inkl. aller Unterordner.
export function baueBaum(liste) {
  const wurzel = { name: BELEGE_WURZEL, pfad: BELEGE_WURZEL, ordner: [], dateien: [], anzahl: 0 };
  const knoten = new Map([[BELEGE_WURZEL, wurzel]]);
  const hole = (pfad) => {
    if (knoten.has(pfad)) return knoten.get(pfad);
    const eltern = hole(ordnerVon(pfad));
    const neu = { name: dateiName(pfad), pfad, ordner: [], dateien: [], anzahl: 0 };
    eltern.ordner.push(neu);
    knoten.set(pfad, neu);
    return neu;
  };
  for (const d of liste) {
    const ordner = ordnerVon(d.pfad);
    hole(ordner).dateien.push(d);
    for (const pfad of vorfahren(ordner)) {
      const k = knoten.get(pfad);
      if (k) k.anzahl += 1;
    }
  }
  for (const k of knoten.values()) k.ordner.sort((a, b) => vergleiche(a.name, b.name));
  return wurzel;
}

export function findeOrdner(baum, pfad) {
  if (baum.pfad === pfad) return baum;
  for (const kind of baum.ordner) {
    if (pfad === kind.pfad || pfad.startsWith(`${kind.pfad}/`)) return findeOrdner(kind, pfad);
  }
  return null;
}

// --- Verweise --------------------------------------------------------------------

const ANDERE = [
  ["vorsorge", "vorsorge", "vorsorge_id", "name"],
  ["darlehen", "darlehen", "darlehen_id", "bezeichnung"],
  ["vermoegenswerte", "vermoegenswert", "vermoegenswert_id", "bezeichnung"],
  ["immobilien", "immobilie", "immobilie_id", "bezeichnung"],
  ["regelzahlungen", "regelzahlung", "regelzahlung_id", "bezeichnung"],
];

// Detailroute eines Datensatzes (Formate wie routing.mjs routeFromState).
export function routeFuerDatensatz(entitaet, id) {
  const e = encodeURIComponent(id);
  if (entitaet === "vorsorge") return `#/vorsorge/${e}`;
  if (entitaet === "regelzahlung") return `#/regelzahlungen/${e}`;
  if (["konto", "immobilie", "vermoegenswert", "darlehen"].includes(entitaet)) return vermoegenRoute(entitaet, id);
  return "#/vermoegen";
}

// Map belegSchluessel(pfad) -> { transaktionen: [ids], andere: [{ entitaet, id, label, route }] }
export function verweisIndex(daten) {
  const index = new Map();
  const eintrag = (pfad) => {
    const k = belegSchluessel(pfad);
    if (!index.has(k)) index.set(k, { transaktionen: [], andere: [] });
    return index.get(k);
  };
  for (const tx of daten.transaktionen ?? []) {
    for (const pfad of belegPfadeAusText(tx.rohquelle)) eintrag(pfad).transaktionen.push(tx.transaktion_id);
  }
  for (const zw of daten.zeitwerte ?? []) {
    for (const pfad of belegPfadeAusText(zw.quelle_hinweis)) {
      eintrag(pfad).andere.push({
        entitaet: "zeitwert",
        id: zw.entitaet_id,
        label: `${zw.entitaet_id} · ${zw.feld} · ${zw.standdatum}`,
        route: routeFuerDatensatz(zw.entitaet, zw.entitaet_id),
      });
    }
  }
  for (const [sammlung, entitaet, idFeld, nameFeld] of ANDERE) {
    for (const satz of daten[sammlung] ?? []) {
      for (const pfad of belegPfadeAusText(satz.quelle_hinweis)) {
        const id = satz[idFeld];
        eintrag(pfad).andere.push({ entitaet, id, label: satz[nameFeld] ? `${id} · ${satz[nameFeld]}` : id, route: routeFuerDatensatz(entitaet, id) });
      }
    }
  }
  return index;
}

// Dokumente eines Objekts (Immobilie, Darlehen, Konto ...): alles im
// Objektordner Belege/<Klasse>/<ID>_<Kurzname>/ und alles, worauf ein Datensatz
// dieses Objekts per quelle_hinweis zeigt. Textzwillinge fallen weg, neueste
// Pfade (Jahresordner) zuerst. ids: IDs, deren Dokumente zusammen gezeigt werden.
// Dokumente eines Objekts: Dateien im eigenen Objektordner (<ID>_...), Dateien, auf
// die ein Datensatz des Objekts verweist, und alles unter `ordner` (Ordner, die der
// Datensatz im Freitext nennt, siehe belegOrdnerAusText).
export function dokumenteZuObjekt({ dateien = [], index = new Map(), ids = [], ordner = [] }) {
  const gesucht = new Set(ids);
  const pfade = new Set();
  for (const datei of dateien) {
    const pfad = String(datei.pfad);
    const objektOrdner = pfad.split("/")[2] ?? "";
    const imObjektOrdner = [...gesucht].some((id) => objektOrdner === id || objektOrdner.startsWith(`${id}_`));
    if (imObjektOrdner || ordner.some((o) => pfad.startsWith(o))) pfade.add(belegSchluessel(pfad));
  }
  for (const [pfad, verweis] of index) {
    if (verweis.andere.some((a) => gesucht.has(a.id))) pfade.add(pfad);
  }
  const basen = new Set([...pfade, ...dateien.map((d) => belegSchluessel(d.pfad))].filter((p) => !/\.txt$/i.test(p)).map(ohneEndung));
  return [...pfade]
    .filter((p) => !(/\.txt$/i.test(p) && basen.has(ohneEndung(p))))
    .sort((a, b) => b.localeCompare(a))
    .map((pfad) => ({ pfad, name: dateiName(pfad) }));
}

export function verweisAnzahl(verweis) {
  return verweis ? verweis.transaktionen.length + verweis.andere.length : 0;
}

export function fasseTransaktionenZusammen(transaktionen) {
  const daten = transaktionen.map((tx) => tx.buchungsdatum).filter(Boolean).sort();
  return {
    anzahl: transaktionen.length,
    konten: [...new Set(transaktionen.map((tx) => tx.konto_id).filter(Boolean))].sort(),
    von: daten[0] ?? "",
    bis: daten.at(-1) ?? "",
  };
}

// --- Liste ---------------------------------------------------------------------------

export function sortiereDateien(dateien, { key, dir }, anzahlFuer = () => 0) {
  const faktor = dir === "desc" ? -1 : 1;
  return dateien.slice().sort((a, b) => {
    let cmp = 0;
    if (key === "groesse") cmp = a.groesse - b.groesse;
    else if (key === "geaendert") cmp = String(a.geaendert).localeCompare(String(b.geaendert));
    else if (key === "typ") cmp = String(a.typ).localeCompare(String(b.typ));
    else if (key === "verknuepft") cmp = anzahlFuer(a) - anzahlFuer(b);
    else if (key === "text") cmp = String(a.textStatus).localeCompare(String(b.textStatus));
    if (cmp === 0) cmp = vergleiche(a.name, b.name);
    if (cmp === 0) cmp = vergleiche(a.pfad, b.pfad);
    return cmp * faktor;
  });
}

export function sucheDateien(dateien, suche) {
  const q = String(suche ?? "").trim().toLocaleLowerCase("de").normalize("NFC");
  if (!q) return dateien;
  return dateien.filter((d) => d.name.toLocaleLowerCase("de").normalize("NFC").includes(q));
}

export function formatGroesse(bytes, locale = "de-DE") {
  const nf = (n, stellen) => n.toLocaleString(locale, { maximumFractionDigits: stellen });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${nf(bytes / 1024, 0)} KB`;
  return `${nf(bytes / (1024 * 1024), 1)} MB`;
}
