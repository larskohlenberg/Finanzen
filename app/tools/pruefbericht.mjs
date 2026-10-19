// app/tools/pruefbericht.mjs
//
// Nachkontrolle statt Vorab-Zustimmung (ADR 0025). Rein lesend, blockiert nie,
// Exit-Code immer 0. Ersetzt die Bucket-Dialoge durch eine Liste dessen, was
// ein Mensch sich ansehen sollte — vor allem das, was nie ein Mensch gesehen hat.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { mitLesestand } from "./lib/lesestand.mjs";
import { istWiderspruch, menschlichEntschieden } from "./lib/entscheidung.mjs";
import { centsToDecimal, normalizeLoose, toCents } from "./lib/text.mjs";
import { metriken, gesperrteBelegstufenAus } from "./lernen.mjs";
import { kontoanker, ungedeckteKonten } from "./lib/kontoanker.mjs";
import { reconciliationDrift } from "../vermoegen.mjs";

const GROSSE_ANZAHL = 15;
const AUSREISSER_FAKTOR = 2;
const AUSREISSER_MINDESTABWEICHUNG_CENT = 10000; // 100 EUR: darunter ist es Rauschen

const istAuto = (tx) => tx.bestaetigt_durch === "auto";
const istMensch = (tx) => tx.bestaetigt_durch === "mensch" || tx.kategorie_herkunft === "manuell";

function median(werte) {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Kategorien, deren juengster Monat stark vom Median der sechs davor abweicht.
function ausreisser(transaktionen) {
  const proKategorieMonat = new Map();
  for (const tx of transaktionen) {
    if (!tx.kategorie_id) continue;
    const key = `${tx.kategorie_id}|${tx.buchungsdatum.slice(0, 7)}`;
    proKategorieMonat.set(key, (proKategorieMonat.get(key) ?? 0) + Math.abs(toCents(tx.betrag)));
  }
  const proKategorie = new Map();
  for (const [key, summe] of proKategorieMonat) {
    const [kategorie_id, monat] = key.split("|");
    if (!proKategorie.has(kategorie_id)) proKategorie.set(kategorie_id, []);
    proKategorie.get(kategorie_id).push({ monat, summe });
  }
  const treffer = [];
  for (const [kategorie_id, monate] of proKategorie) {
    if (monate.length < 3) continue;
    monate.sort((a, b) => a.monat.localeCompare(b.monat));
    const juengster = monate[monate.length - 1];
    const vergleich = median(monate.slice(-7, -1).map((m) => m.summe));
    if (vergleich === 0) continue;
    const abweichung = juengster.summe - vergleich;
    if (juengster.summe > vergleich * AUSREISSER_FAKTOR && abweichung > AUSREISSER_MINDESTABWEICHUNG_CENT) {
      treffer.push({ kategorie_id, monat: juengster.monat, summe_cent: juengster.summe, median_cent: vergleich });
    }
  }
  return treffer;
}

// Menschliche Entscheidungen, denen das Regelwerk heute eine andere Kategorie
// gibt. Kein Regellauf fasst sie an; ohne diese Liste blieben sie nach einem
// Regel-Tuning still stale (der Grund, aus dem ADR 0017 "tabu" einst verwarf).
function widersprueche(transaktionen, regeln) {
  const liste = [];
  for (const tx of transaktionen) {
    if (!menschlichEntschieden(tx)) continue;
    const jetzt = categorize(tx, regeln);
    if (!istWiderspruch(tx, jetzt)) continue;
    liste.push({
      transaktion_id: tx.transaktion_id, buchungsdatum: tx.buchungsdatum, betrag: tx.betrag,
      gegenpartei: tx.gegenpartei, konto_id: tx.konto_id,
      ist_kategorie: tx.kategorie_id, regel_kategorie: jetzt.kategorie_id, regeln: jetzt.matched_regeln,
    });
  }
  return liste;
}

// Der Import-Agent schreibt die Differenz als `{ konto_id, betrag, grund }`
// (siehe agent-context). Vorher stand hier `undefined: Differenz
// [object Object]`, weil das Rendering ein `quelle` erwartete, das der Agent nie
// schreibt, und einen skalaren Betrag, den er nie schreibt — eine erklaerte
// Differenz war damit unlesbar, und genau dafuer gibt es diesen Abschnitt.
//
// Eine nicht reconcilierte Differenz gehoert zu einem **Konto**, nicht zu einer
// Datei: `normalisierung.dateien` ist eine Anzahl, kein Name. Reihenfolge der
// Aufloesung: das festgeschriebene `konto_id`, das aeltere `quelle`, sonst der
// `anlass` des Logeintrags. Bestehende Eintraege werden nicht umgeschrieben.
function reconQuelle(eintrag) {
  const n = eintrag.normalisierung;
  const differenz = n.reconciliation_differenz;
  const kandidaten = [
    differenz !== null && typeof differenz === "object" ? differenz.konto_id : null,
    n.quelle,
    eintrag.anlass,
  ];
  return kandidaten.map((k) => String(k ?? "").trim()).find((k) => k.length > 0) ?? "(ohne Quellenangabe)";
}

// Nur anzeigen, nicht rechnen: der Betrag bleibt der Decimal-String aus dem Log.
function reconDifferenz(differenz) {
  if (differenz === null || typeof differenz !== "object") return String(differenz);
  const grund = String(differenz.grund ?? "").trim();
  const betrag = String(differenz.betrag ?? "(ohne Betrag)");
  return grund ? `${betrag} — ${grund}` : betrag;
}

// Ein spaeterer Lauf, der die Luecke schliesst, vermerkt das unter
// `normalisierung.reconciliation_erledigt: { konto_id, bezug, grund }` (Objekt
// oder Liste). Bestehende Eintraege werden nie umgeschrieben; erledigt ist eine
// Differenz, wenn ein SPAETERER Eintrag fuer dasselbe Konto sie abhakt. Vorher
// stand hier jede je protokollierte Differenz fuer immer im Bericht.
function erledigtKonten(eintrag) {
  const e = eintrag.normalisierung?.reconciliation_erledigt ?? eintrag.reconciliation_erledigt;
  return (Array.isArray(e) ? e : e ? [e] : []).map((x) => String(x?.konto_id ?? "").trim()).filter(Boolean);
}

// Aeltere Eintraege tragen kein `konto_id` an der Differenz; dann nennt der
// Anlass das Konto (z. B. "Erstimport KTO-006 ..."). Nur ein eindeutiger
// Treffer zaehlt, sonst bleibt die Differenz sichtbar.
function differenzKonto(eintrag) {
  const d = eintrag.normalisierung.reconciliation_differenz;
  const direkt = d !== null && typeof d === "object" ? String(d.konto_id ?? "").trim() : "";
  if (direkt) return direkt;
  const text = `${eintrag.normalisierung.quelle ?? ""} ${eintrag.anlass ?? ""}`;
  const treffer = [...new Set(text.match(/KTO-[A-Za-z0-9-]*[A-Za-z0-9]/g) ?? [])];
  return treffer.length === 1 ? treffer[0] : null;
}

export function offeneReconciliation(log) {
  const eintraege = log ?? [];
  return eintraege.flatMap((e, i) => {
    if (!e.normalisierung?.reconciliation_differenz) return [];
    const quelle = reconQuelle(e);
    const konto = differenzKonto(e);
    const spaeterErledigt = konto !== null && eintraege.slice(i + 1).some((spaeter) => erledigtKonten(spaeter).includes(konto));
    return spaeterErledigt ? [] : [{ ...e.normalisierung, quelle }];
  });
}

// Dubletten-Prueffaelle (ADR 0034), die Inbox-Lauf und import.mjs ins Protokoll
// schreiben. Sichtbar bis zum letzten Eintrag mit `dubletten_geprueft: true`
// (der Agent setzt ihn, nachdem er die Faelle mit dem Nutzer angesehen hat).
export function offeneDublettenPruefungen(log) {
  const eintraege = log ?? [];
  const abgehakt = eintraege.findLastIndex((e) => e.dubletten_geprueft === true);
  return eintraege.slice(abgehakt + 1).flatMap((e) => (Array.isArray(e.dubletten_pruefen) ? e.dubletten_pruefen : []).map((fall) => ({ ...fall, zeitpunkt: e.zeitpunkt })));
}

// Was zwischen geschriebenen Ankern nicht aufgeht, rechnet der Bericht selbst
// nach (dieselbe Funktion wie die Vermoegens-Checks) — unabhaengig davon, ob ein
// Agent es je protokolliert hat.
function saldenDrift(konten, zeitwerte, transaktionen) {
  return (konten ?? [])
    .filter((k) => k.status !== "geschlossen" && k.kontotyp !== "bar" && k.kontotyp !== "depot")
    .flatMap((k) => reconciliationDrift(k, zeitwerte, transaktionen));
}

export function pruefbericht({ transaktionen, regeln, konten, zeitwerte, log }) {
  const autos = (transaktionen ?? []).filter(istAuto);

  // Ein Merchant, den nie ein Mensch bestaetigt hat, ist der eigentliche
  // blinde Fleck der Automatik — nicht der groesste Betrag.
  const menschlicheMerchants = new Set((transaktionen ?? []).filter(istMensch).map((tx) => normalizeLoose(tx.gegenpartei)));
  const nurAuto = new Map();
  for (const tx of autos) {
    const key = normalizeLoose(tx.gegenpartei);
    if (menschlicheMerchants.has(key)) continue;
    const eintrag = nurAuto.get(key) ?? { gegenpartei: tx.gegenpartei, anzahl: 0, kategorie_id: tx.kategorie_id };
    eintrag.anzahl += 1;
    nurAuto.set(key, eintrag);
  }

  const letzteFreigabe = [...(log ?? [])].filter((e) => e.anlass === "freigabe").pop();
  const ankerIds = new Set((zeitwerte ?? [])
    .filter((z) => z.entitaet === "konto" && (z.feld === "kontostand" || z.feld === "depotwert"))
    .map((z) => z.entitaet_id));

  return {
    grosse: [...autos].sort((a, b) => Math.abs(toCents(b.betrag)) - Math.abs(toCents(a.betrag))).slice(0, GROSSE_ANZAHL),
    nur_auto_merchants: [...nurAuto.values()].sort((a, b) => b.anzahl - a.anzahl),
    ausreisser: ausreisser(transaktionen ?? []),
    kat012: autos.filter((tx) => tx.kategorie_id === "KAT-012"),
    // Schaetzungen des Agenten (ADR 0029): nur Information, kein Blocker. Was
    // ein Mensch schon bestaetigt oder korrigiert hat, ist keine Schaetzung mehr.
    agent_geschaetzt: (transaktionen ?? []).filter((tx) => tx.kategorie_herkunft === "agent" && tx.bestaetigt_durch !== "mensch").length,
    widersprueche: widersprueche(transaktionen ?? [], regeln ?? []),
    gate_durchfall: letzteFreigabe?.gate_durchfall ?? [],
    // Was das Gate gehalten hat, steht schon im Logeintrag. Diese Liste zeigt
    // die ganze Flaeche: jedes Konto, auf dem eine Regel wirkt, ohne dass dort
    // je ein Mensch ihre Kategorie entschieden hat (ADR 0027).
    regeln_ohne_kontoanker: ungedeckteKonten(regeln ?? [], kontoanker(transaktionen ?? [])),
    e4_regeln: (regeln ?? []).filter((r) => r.belegstufe === "E4" && r.status === "aktiv"),
    konten_ohne_anker: (konten ?? []).filter((k) => !ankerIds.has(k.konto_id)),
    // Ein Kopf-Kontostand, der nicht aufging, wurde bewusst NICHT geschrieben.
    // Genau deshalb muss er hier sichtbar sein, sonst verschwindet die Luecke.
    reconciliation: offeneReconciliation(log),
    salden_drift: saldenDrift(konten, zeitwerte, transaktionen),
    dubletten_pruefen: offeneDublettenPruefungen(log),
    lernen: metriken(log ?? [], gesperrteBelegstufenAus(log ?? [])),
  };
}

function zeile(betrag, text) {
  return `  ${String(betrag).padStart(12)}  ${text}`;
}

export function renderBericht(b) {
  const z = [];
  z.push(`GROESSTE AUTO-FREIGABEN (${b.grosse.length})`);
  for (const tx of b.grosse) z.push(zeile(tx.betrag, `${tx.buchungsdatum}  ${tx.gegenpartei}  [${tx.kategorie_id}]`));

  z.push("", `MERCHANTS, DIE NIE EIN MENSCH BESTAETIGT HAT (${b.nur_auto_merchants.length})`);
  for (const m of b.nur_auto_merchants.slice(0, 20)) z.push(`  ${String(m.anzahl).padStart(4)}x  ${m.gegenpartei}  [${m.kategorie_id}]`);

  z.push("", `KATEGORIE-AUSREISSER (${b.ausreisser.length})`);
  for (const a of b.ausreisser) z.push(`  ${a.kategorie_id}  ${a.monat}: ${(a.summe_cent / 100).toFixed(2)} gegen Median ${(a.median_cent / 100).toFixed(2)}`);

  z.push("", `AUTO-FREIGEGEBEN AUF KAT-012 — NOCH ZU KLAEREN (${b.kat012.length})`);
  for (const tx of b.kat012) z.push(zeile(tx.betrag, `${tx.buchungsdatum}  ${tx.gegenpartei}`));

  z.push("", `VOM AGENTEN GESCHAETZT, HERKUNFT AGENT (${b.agent_geschaetzt})`);
  z.push("  nur zur Kenntnis — korrigieren ueber Transaktionen, Filter Herkunft = Agent");

  z.push("", `MENSCHLICHE ENTSCHEIDUNGEN IM WIDERSPRUCH ZUM REGELWERK (${b.widersprueche.length})`);
  z.push("  bleiben unveraendert — Regel schaerfen oder die Buchung neu entscheiden (bestaetigen, auch entschiedene)");
  for (const w of b.widersprueche) z.push(zeile(w.betrag, `${w.buchungsdatum}  ${w.gegenpartei}  ${w.ist_kategorie} -> ${w.regel_kategorie}  [${w.regeln.join(", ")}]`));

  z.push("", `AM GATE GESCHEITERT (${b.gate_durchfall.length})`);
  for (const d of b.gate_durchfall) z.push(`  ${d.regel_id}${d.konto_id ? ` auf ${d.konto_id}` : ""}: ${d.grund}`);

  const verliehen = b.regeln_ohne_kontoanker.filter((e) => e.verliehen);
  const neuland = b.regeln_ohne_kontoanker.filter((e) => !e.verliehen);
  z.push("", `REGELN AUF KONTEN OHNE MENSCHLICHEN ANKER (${b.regeln_ohne_kontoanker.length})`);
  z.push(`  verliehene Belegstufe — vom Gate gehalten (${verliehen.length})`);
  if (verliehen.length === 0) z.push("    keine");
  for (const e of verliehen) z.push(`    ${e.regel_id}  [${e.kategorie_id}]  ${e.belegstufe ?? "ohne Stufe"}  ${e.konto_id}: ${e.anzahl}  (verdient auf ${e.gedeckt.join(", ")})`);
  z.push(`  neu erschlossen, nirgends ein Anker — nur zur Kenntnis (${neuland.length})`);
  if (neuland.length === 0) z.push("    keine");
  for (const e of neuland.slice(0, 20)) z.push(`    ${e.regel_id}  [${e.kategorie_id}]  ${e.belegstufe ?? "ohne Stufe"}  ${e.konto_id}: ${e.anzahl}`);

  z.push("", `REGELN NUR AUF WEB-RECHERCHE, BELEGSTUFE E4 (${b.e4_regeln.length})`);
  for (const r of b.e4_regeln) z.push(`  ${r.regel_id}  [${r.kategorie_id}]  ${r.kommentar}`);

  z.push("", `KONTEN OHNE BELEGTEN ANKER (${b.konten_ohne_anker.length})`);
  for (const k of b.konten_ohne_anker) z.push(`  ${k.konto_id}  ${k.name}`);

  const drift = b.salden_drift ?? [];
  z.push("", `NICHT RECONCILIERTE KONTOSTAENDE (${drift.length + b.reconciliation.length})`);
  z.push(`  Saldenkette zwischen belegten Ankern — nachgerechnet (${drift.length})`);
  if (drift.length === 0) z.push("    keine");
  for (const d of drift) z.push(`    ${d.konto_id}  ${d.von} -> ${d.bis}: belegt ${centsToDecimal(d.belegt_cents)}, erwartet ${centsToDecimal(d.erwartet_cents)}, Differenz ${centsToDecimal(d.differenz_cents)}`);
  z.push(`  zurueckgehaltene Kopfstaende — laut Protokoll, nicht erledigt (${b.reconciliation.length})`);
  if (b.reconciliation.length === 0) z.push("    keine");
  for (const r of b.reconciliation) z.push(`    ${r.quelle}: Differenz ${reconDifferenz(r.reconciliation_differenz)}`);

  const dubletten = b.dubletten_pruefen ?? [];
  z.push("", `DUBLETTEN-PRUEFFAELLE AUS IMPORTEN (${dubletten.length})`);
  z.push("  nach Anzahl entschieden, aber nicht sicher — ansehen, danach im Protokoll dubletten_geprueft: true");
  for (const f of dubletten) {
    const bezug = f.transaktion_id ? `  ${f.transaktion_id}` : "";
    z.push(`  ${f.art}  ${f.konto_id}  ${f.quelle ?? "(ohne Quelle)"} Zeile ${(f.zeilen ?? []).join(", ")}${bezug}  (${String(f.zeitpunkt ?? "").slice(0, 10)})`);
    if (f.hinweis) z.push(`    ${f.hinweis}`);
  }

  const auffaellig = b.lernen.je_regel.filter((r) => r.korrekturen > 0);
  z.push("", `REGELN MIT KORREKTUREN AN AUTO-FREIGABEN (${auffaellig.length})`);
  for (const r of auffaellig.slice(0, 10)) z.push(`  ${r.regel_id}  ${(r.quote * 100).toFixed(0)}%  (${r.korrekturen}/${r.freigaben})`);
  z.push(`GESPERRTE BELEGSTUFEN: ${b.lernen.gesperrte_belegstufen.join(", ") || "keine"}`);
  return z.join("\n");
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8").catch(() => "");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function main() {
  const datenroot = dataRootFromArg(process.argv.slice(2).find((a) => !a.startsWith("--")));
  if (!datenroot) throw new Error("Datenbestand fehlt: ausdruecklich angeben, z. B. data/master oder data/demo.");
  // Alle Dateien aus einer Generation (Lease), im einfachen Ordner direkt.
  const [transaktionen, zeitwerte, log, regeln, konten] = await mitLesestand(datenroot, ({ url: masterRoot }) => Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJsonl(new URL("zeitwerte.jsonl", masterRoot)),
    readJsonl(new URL("agent_log.jsonl", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
    readJson(new URL("konten.json", masterRoot)),
  ]));
  console.log(renderBericht(pruefbericht({ transaktionen, regeln, konten, zeitwerte, log })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
