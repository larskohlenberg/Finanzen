// app/tools/pruefbericht.mjs
//
// Nachkontrolle statt Vorab-Zustimmung (ADR 0025). Rein lesend, blockiert nie,
// Exit-Code immer 0. Ersetzt die Bucket-Dialoge durch eine Liste dessen, was
// ein Mensch sich ansehen sollte — vor allem das, was nie ein Mensch gesehen hat.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { normalizeLoose, toCents } from "./lib/text.mjs";
import { metriken, gesperrteBelegstufenAus } from "./lernen.mjs";

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
    gate_durchfall: letzteFreigabe?.gate_durchfall ?? [],
    e4_regeln: (regeln ?? []).filter((r) => r.belegstufe === "E4" && r.status === "aktiv"),
    konten_ohne_anker: (konten ?? []).filter((k) => !ankerIds.has(k.konto_id)),
    // Ein Kopf-Kontostand, der nicht aufging, wurde bewusst NICHT geschrieben.
    // Genau deshalb muss er hier sichtbar sein, sonst verschwindet die Luecke.
    reconciliation: (log ?? [])
      .flatMap((e) => e.normalisierung ? [e.normalisierung] : [])
      .filter((n) => n.reconciliation_differenz),
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

  z.push("", `AM GATE GESCHEITERT (${b.gate_durchfall.length})`);
  for (const d of b.gate_durchfall) z.push(`  ${d.regel_id}: ${d.grund}`);

  z.push("", `REGELN NUR AUF WEB-RECHERCHE, BELEGSTUFE E4 (${b.e4_regeln.length})`);
  for (const r of b.e4_regeln) z.push(`  ${r.regel_id}  [${r.kategorie_id}]  ${r.kommentar}`);

  z.push("", `KONTEN OHNE BELEGTEN ANKER (${b.konten_ohne_anker.length})`);
  for (const k of b.konten_ohne_anker) z.push(`  ${k.konto_id}  ${k.name}`);

  z.push("", `NICHT RECONCILIERTE KONTOSTAENDE (${b.reconciliation.length})`);
  for (const r of b.reconciliation) z.push(`  ${r.quelle}: Differenz ${r.reconciliation_differenz}`);

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
  const masterRoot = dataRootFromArg(process.argv.slice(2).find((a) => !a.startsWith("--")));
  const [transaktionen, zeitwerte, log, regeln, konten] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJsonl(new URL("zeitwerte.jsonl", masterRoot)),
    readJsonl(new URL("agent_log.jsonl", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
    readJson(new URL("konten.json", masterRoot)),
  ]);
  console.log(renderBericht(pruefbericht({ transaktionen, regeln, konten, zeitwerte, log })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
