// app/diffusor.mjs
// Diffusor-Modus (Sichtschutz fuer Bildschirmfreigabe und Screenshots): Betraege
// werden zu unlesbaren Zeichen, Namen zu neutralen Platzhaltern ("Girokonto A",
// "Person 1"). Diagramme, Prozente, Daten und Kategorien bleiben, damit das Bild
// fuer Erklaerungen erhalten bleibt. Reine Funktionen ohne DOM; die Anzeige
// (Beobachter, Walzen-Animation) liegt in diffusor-anzeige.mjs.
//
// Die Zeichen sind gespiegelte und gedrehte Buchstaben und Ziffern anderer
// Schriften: sie sehen nach Zahl aus, lassen sich aber nicht lesen. Sie haengen
// von einem Salz je Seitenaufruf ab, nicht allein vom Betrag, und jeder Betrag
// hat gleich viele Zeichen, damit die Laenge die Groessenordnung nicht verraet.

export const ZEICHEN = [..."ƐƆƎƖʞ⅄ʍɯɐɥɟʇɹɔəʌ٣٧٩९६३ϛ"];
export const STELLEN = 6;

const ZEICHEN_KLASSE = `[${ZEICHEN.join("")}]`;
// Zeichenfolgen, die schon verdeckt sind (aus dem verschleierten Formatierer).
const VERDECKT = new RegExp(`${ZEICHEN_KLASSE}+`, "u");

// FNV-1a ueber Salz und Schluessel; daraus ein einfacher Zufallsgenerator.
function hash(text) {
  let h = 0x811c9dc5;
  for (const zeichen of text) {
    h ^= zeichen.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function zeichenFolge(schluessel, salz, laenge = STELLEN) {
  let x = hash(`${salz}\u0000${schluessel}`) || 1;
  let folge = "";
  for (let i = 0; i < laenge; i += 1) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    folge += ZEICHEN[x % ZEICHEN.length];
  }
  return folge;
}

export function zufallsZeichen() {
  return ZEICHEN[Math.floor(Math.random() * ZEICHEN.length)];
}

export function neuesSalz() {
  const zahlen = new Uint32Array(2);
  globalThis.crypto.getRandomValues(zahlen);
  return [...zahlen].map((z) => z.toString(36)).join("");
}

// Ziffernblock eines formatierten Betrags ("1.234,56", "12,3") durch feste
// Zeichen ersetzen; Vorzeichen und Waehrung bleiben stehen.
const ZIFFERNBLOCK = /\d(?:[\d.,   ]*\d)?/u;
export function verdeckeBetrag(text, salz) {
  return String(text).replace(ZIFFERNBLOCK, (block) => zeichenFolge(block.replace(/\D/g, ""), salz));
}

// Formatierer (format.mjs) mit verdeckten Geldbetraegen; Prozent, Zahl und
// Datum bleiben lesbar.
export function verschleierterFormatierer(basis, salz) {
  const verdeckt = (name) => (...args) => verdeckeBetrag(basis[name](...args), salz);
  return {
    ...basis,
    geld: verdeckt("geld"),
    geldGanz: verdeckt("geldGanz"),
    geldMitVorzeichen: verdeckt("geldMitVorzeichen"),
    tausend: verdeckt("tausend"),
  };
}

// Freitext (Verwendungszweck, Bemerkung, Dokumentname): jedes Wort wird zu
// Zeichen gleicher Laenge (hoechstens zehn), Leerraum und Satzbau bleiben.
export function verdeckeFreitext(text, salz) {
  return String(text).replace(/[^\s]+/gu, (wort) => zeichenFolge(wort, salz, Math.min([...wort].length, 10)));
}

const klein = (text) => String(text ?? "").normalize("NFC").trim().toLowerCase();

// Gegenparteien bekommen je Seitenaufruf eine feste Nummer in der Reihenfolge,
// in der sie zuerst erscheinen.
export function gegenparteiNummern() {
  const nummern = new Map();
  return (name) => {
    const schluessel = klein(name);
    if (!nummern.has(schluessel)) nummern.set(schluessel, nummern.size + 1);
    return nummern.get(schluessel);
  };
}

const BUCHSTABEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const buchstabe = (i) => (i < BUCHSTABEN.length ? BUCHSTABEN[i] : `${BUCHSTABEN[i % BUCHSTABEN.length]}${Math.floor(i / BUCHSTABEN.length)}`);

// Platzhalter je Name aus dem Bestand: Liste [echt, ersatz], laengste zuerst.
// namen liefert die Texte der Sprache: person(n), konto(art, kennung),
// vorsorge(art, n), immobilie(n), darlehen(n), vermoegenswert(n),
// regelzahlung(kategorie, n), gegenpartei(n); kontoArt, vorsorgeArt und
// kategorie loesen Bezeichnungen auf.
export function pseudonymTabelle(daten, namen, gegenpartei = gegenparteiNummern()) {
  const paare = [];
  const zaehler = new Map();
  const naechste = (gruppe) => {
    const n = (zaehler.get(gruppe) ?? 0) + 1;
    zaehler.set(gruppe, n);
    return n;
  };
  // Kategorienamen sind allgemein ("Kindergeld") und bleiben stehen, auch wenn
  // eine Regelzahlung genauso heisst.
  const allgemein = new Set((daten.kategorien ?? []).map((k) => klein(k.name)));
  const neu = (echt, ersatz) => {
    if (String(echt ?? "").trim().length >= 2 && !allgemein.has(klein(echt))) paare.push([String(echt).trim(), ersatz]);
  };
  for (const person of daten.personen ?? []) {
    const ersatz = namen.person(naechste("person"));
    neu(person.name, ersatz);
    // Vornamen stehen oft allein in Vertragsnamen ("Rente Lena").
    const vorname = String(person.name ?? "").trim().split(/\s+/)[0];
    if (vorname && vorname !== String(person.name).trim() && vorname.length >= 3) neu(vorname, ersatz);
  }
  for (const konto of daten.konten ?? []) {
    neu(konto.name, namen.konto(namen.kontoArt(konto.kontotyp), buchstabe(naechste(`konto:${konto.kontotyp}`) - 1)));
  }
  for (const vertrag of daten.vorsorge ?? []) {
    neu(vertrag.name, namen.vorsorge(namen.vorsorgeArt(vertrag.art), naechste(`vorsorge:${vertrag.art}`)));
  }
  for (const immobilie of daten.immobilien ?? []) neu(immobilie.bezeichnung, namen.immobilie(naechste("immobilie")));
  for (const darlehen of daten.darlehen ?? []) neu(darlehen.bezeichnung, namen.darlehen(naechste("darlehen")));
  for (const wert of daten.vermoegenswerte ?? []) neu(wert.bezeichnung, namen.vermoegenswert(naechste("vermoegenswert")));
  for (const rz of daten.regelzahlungen ?? []) {
    const kategorie = namen.kategorie(rz.kategorie_id);
    neu(rz.bezeichnung, namen.regelzahlung(kategorie, naechste(`regelzahlung:${kategorie}`)));
  }
  // Logo-Namen sind Banken und Haendler, die auch in Texten auftauchen.
  for (const logo of daten.logos ?? []) if (logo?.name) neu(logo.name, namen.gegenpartei(gegenpartei(logo.name)));
  // Doppelte Namen: der erste gewinnt; laengste zuerst, damit "Giro Familie"
  // vor "Giro" greift.
  const gesehen = new Set();
  return paare
    .filter(([echt]) => !gesehen.has(klein(echt)) && gesehen.add(klein(echt)))
    .sort((a, b) => b[0].length - a[0].length);
}

const regexText = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Betraege, die nicht ueber den Formatierer kamen (z. B. Texte vom Server):
// "1.234,56 €", "-12 €", "12,3 T€", "€1,234.56".
const GELD = String.raw`[-+−]?(?:€\s?\d(?:[\d.,  ]*\d)?|\d(?:[\d.,  ]*\d)?[\s  ]?(?:T€|k€|€|EUR(?!\p{L})))`;

// Ersetzer aus der Pseudonym-Tabelle: ein regulaerer Ausdruck fuer Namen (ganze
// Woerter, ohne Gross-/Kleinschreibung), Betraege und schon verdeckte Zeichen.
export function erstelleErsetzer(tabelle) {
  const ersatz = new Map(tabelle.map(([echt, neu]) => [klein(echt), neu]));
  const namenTeil = tabelle.length
    ? `(?<![\\p{L}\\p{N}])(?<name>${tabelle.map(([echt]) => regexText(echt)).join("|")})(?![\\p{L}\\p{N}])|`
    : "";
  const muster = new RegExp(`${namenTeil}(?<geld>${GELD})|(?<verdeckt>${ZEICHEN_KLASSE}+)`, "giu");
  return { muster, ersatz };
}

// Text in Abschnitte zerlegen: { text, verdeckt }. ersetzen=false markiert nur
// (fuer die Animation beim Ausschalten), der Text bleibt dann, wie er ist.
export function zerlege(text, ersetzer, salz, { ersetzen = true } = {}) {
  const roh = String(text ?? "");
  const teile = [];
  let pos = 0;
  for (const treffer of roh.matchAll(ersetzer.muster)) {
    if (treffer.index > pos) teile.push({ text: roh.slice(pos, treffer.index), verdeckt: false });
    const { name, geld } = treffer.groups;
    let neu = treffer[0];
    if (ersetzen && name) neu = ersetzer.ersatz.get(klein(name)) ?? treffer[0];
    else if (ersetzen && geld) neu = verdeckeBetrag(geld, salz);
    teile.push({ text: neu, verdeckt: true });
    pos = treffer.index + treffer[0].length;
  }
  if (pos < roh.length) teile.push({ text: roh.slice(pos), verdeckt: false });
  return teile;
}

export function verdeckeText(text, ersetzer, salz) {
  return zerlege(text, ersetzer, salz).map((teil) => teil.text).join("");
}

export function istVerdeckt(text) {
  return VERDECKT.test(String(text ?? ""));
}
