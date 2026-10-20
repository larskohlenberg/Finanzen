// app/schnellsuche.mjs
// Schnellsuche (Cmd/Strg+K): Seiten und Objekte nach Name oder ID finden und
// direkt ansteuern (rein, ohne DOM). Im Gespraech mit dem Agenten fallen
// staendig IDs (KTO-001, RZ-008, TXN-…); die sollen sofort auffindbar sein.
import { vermoegenRoute } from "./vermoegen-routen.mjs";

const enc = encodeURIComponent;
const QUELLEN = [
  ["konto", "konten", "konto_id", "name", (id) => vermoegenRoute("konto", id)],
  ["kategorie", "kategorien", "kategorie_id", "name", (id) => `#/transaktionen?kategorie=${enc(id)}`],
  ["regelzahlung", "regelzahlungen", "regelzahlung_id", "bezeichnung", (id) => `#/termine/regelzahlungen/${enc(id)}`],
  ["vorsorge", "vorsorge", "vorsorge_id", "name", (id) => `#/vorsorge/${enc(id)}`],
  ["immobilie", "immobilien", "immobilie_id", "bezeichnung", (id) => vermoegenRoute("immobilie", id)],
  ["darlehen", "darlehen", "darlehen_id", "bezeichnung", (id) => vermoegenRoute("darlehen", id)],
  ["vermoegenswert", "vermoegenswerte", "vermoegenswert_id", "bezeichnung", (id) => vermoegenRoute("vermoegenswert", id)],
  ["szenario", "szenarien", "szenario_id", "name", (id) => `#/szenarien/${enc(id)}`],
  ["regel", "kategorisierungsregeln", "regel_id", null, (id) => `#/regeln/${enc(id)}`],
  ["frist", "fristen", "frist_id", "bezeichnung", () => "#/termine/fristen"],
];

// Kleinbuchstaben, ohne Akzente/Umlaut-Punkte, ss fuer ss.
export function normiere(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

// seiten: [{ name, route }] (aus der Navigation, schon uebersetzt).
export function suchIndex(daten, { seiten = [] } = {}) {
  const eintraege = seiten.map((s) => ({ art: "seite", id: "", name: s.name, route: s.route }));
  for (const [art, liste, idFeld, nameFeld, route] of QUELLEN) {
    for (const o of daten?.[liste] ?? []) {
      const id = o[idFeld];
      if (!id) continue;
      const name = nameFeld ? o[nameFeld] ?? "" : Object.values(o.matcher ?? {}).filter((w) => typeof w === "string").join(" ");
      eintraege.push({ art, id, name, route: route(id) });
    }
  }
  return eintraege.map((e) => ({ ...e, schluessel: normiere(`${e.id} ${e.name}`), idNorm: normiere(e.id), nameNorm: normiere(e.name) }));
}

const BUCHUNG = /^txn-[0-9a-f-]{8,}$/i;

// Treffer nach Vorrang: ID genau, ID beginnt, Name beginnt, alle Woerter enthalten.
export function suche(index, anfrage, max = 12) {
  const q = normiere(anfrage).trim();
  if (!q) return [];
  const treffer = [];
  if (BUCHUNG.test(q)) {
    const id = String(anfrage).trim();
    treffer.push({ art: "buchung", id, name: "", route: `#/transaktionen/${enc(id)}`, rang: 0 });
  }
  const woerter = q.split(/\s+/);
  for (const e of index) {
    if (!woerter.every((w) => e.schluessel.includes(w))) continue;
    const rang = e.idNorm === q ? 0 : e.idNorm.startsWith(q) ? 1 : e.nameNorm.startsWith(q) ? 2 : 3;
    treffer.push({ art: e.art, id: e.id, name: e.name, route: e.route, rang });
  }
  return treffer.sort((a, b) => a.rang - b.rang || a.name.localeCompare(b.name, "de")).slice(0, max).map(({ rang, ...t }) => t);
}
