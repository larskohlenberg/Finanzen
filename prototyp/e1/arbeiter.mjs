// prototyp/e1/arbeiter.mjs
// Eigenstaendiger Prozess fuer die Nebenlaeufigkeits- und Kill-Tests.
//   node arbeiter.mjs <a|b|naiv> <pfad> schreibe <anzahl> <kennung>
//   node arbeiter.mjs <a|b|naiv> <pfad> endlos <kennung>
//   node arbeiter.mjs <a|b|naiv> <pfad> lies <millisekunden>
// Jeder Schreibvorgang aendert ZWEI Sammlungen: eine neue Buchung in
// transaktionen und der passende Eintrag in agent_log. Invariante fuer jeden
// Leser: zu jeder Testbuchung genau ein Logeintrag und umgekehrt.
// E1_HALT=<schritt> laesst den Prozess an diesem Schritt per SIGKILL sterben.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonl } from "../../app/data-loader.mjs";
import { mitLeser, mitSchreiber as schreibeA } from "./generationen.mjs";
import { DB_DATEI, ladeSammlungen, mitSchreiber as schreibeB, oeffneDb, schnappschuss } from "./sqlite-bestand.mjs";

const [variante, pfad, modus, ...rest] = process.argv.slice(2);
const WARTEN = 60000;

export function testBuchung(kennung, n) {
  return {
    transaktion_id: `TXN-E1-${kennung}-${String(n).padStart(5, "0")}`,
    dedupe_hash: `e1-${kennung}-${n}`,
    rohquelle: "e1-test",
    konto_id: "KTO-001",
    buchungsdatum: "2026-10-01",
    betrag: "-1.23",
    gegenpartei: "E1 Testladen",
    verwendungszweck: `E1 ${kennung} ${n}`,
    kategorisierung_status: "offen",
    ist_transfer: false,
  };
}
const logEintrag = (b) => ({ zeitpunkt: new Date().toISOString(), anlass: "e1-test", betroffene_ids: [b.transaktion_id] });

async function einmalA(kennung, n) {
  const b = testBuchung(kennung, n);
  await schreibeA(pfad, async (tx) => {
    const t = await tx.lies("transaktionen.jsonl");
    await tx.schreibe("transaktionen.jsonl", `${t}${JSON.stringify(b)}\n`);
    const l = await tx.lies("agent_log.jsonl");
    await tx.schreibe("agent_log.jsonl", `${l}${JSON.stringify(logEintrag(b))}\n`);
  }, { wartenMs: WARTEN, behalten: 3 });
}

async function einmalB(kennung, n) {
  const b = testBuchung(kennung, n);
  await schreibeB(pfad, (tx) => {
    // Wie die heutigen Werkzeuge: ganze Sammlung neu schreiben.
    tx.ersetze("transaktionen", [...tx.lies("transaktionen"), b]);
    tx.fuegeHinzu("agent_log", logEintrag(b));
  }, { wartenMs: WARTEN });
}

// Heutiger Weg zum Vergleich: zwei Dateien nacheinander direkt ueberschreiben.
async function einmalNaiv(kennung, n) {
  const b = testBuchung(kennung, n);
  const t = await readFile(path.join(pfad, "transaktionen.jsonl"), "utf8");
  await writeFile(path.join(pfad, "transaktionen.jsonl"), `${t}${JSON.stringify(b)}\n`);
  const l = await readFile(path.join(pfad, "agent_log.jsonl"), "utf8");
  await writeFile(path.join(pfad, "agent_log.jsonl"), `${l}${JSON.stringify(logEintrag(b))}\n`);
}

const einmal = { a: einmalA, b: einmalB, naiv: einmalNaiv }[variante];

export function pruefeInvariante(transaktionen, log) {
  const ids = new Set(transaktionen.filter((t) => t.transaktion_id.startsWith("TXN-E1-")).map((t) => t.transaktion_id));
  const geloggt = log.filter((e) => e.anlass === "e1-test").flatMap((e) => e.betroffene_ids);
  const ohneLog = [...ids].filter((id) => !geloggt.includes(id)).length;
  const ohneBuchung = geloggt.filter((id) => !ids.has(id)).length;
  const doppelt = geloggt.length - new Set(geloggt).size;
  return { buchungen: ids.size, ohneLog, ohneBuchung, doppelt, ok: ohneLog === 0 && ohneBuchung === 0 && doppelt === 0 };
}

export async function liesStand(v, p, db) {
  if (v === "a") {
    return mitLeser(p, async (l) => ({
      stand: l.id,
      ...pruefeInvariante(parseJsonl(await l.lies("transaktionen.jsonl")), parseJsonl(await l.lies("agent_log.jsonl"))),
    }));
  }
  if (v === "b") {
    return schnappschuss(db, () => {
      const d = ladeSammlungen(db, ["transaktionen", "agent_log"]);
      return pruefeInvariante(d.transaktionen, d.agent_log);
    });
  }
  const t = await readFile(path.join(p, "transaktionen.jsonl"), "utf8");
  const l = await readFile(path.join(p, "agent_log.jsonl"), "utf8");
  try {
    return pruefeInvariante(parseJsonl(t), parseJsonl(l));
  } catch (error) {
    return { ok: false, kaputt: error.message };
  }
}

async function main() {
  if (modus === "schreibe") {
    const [anzahl, kennung] = rest;
    for (let n = 1; n <= Number(anzahl); n += 1) await einmal(kennung, n);
  } else if (modus === "endlos") {
    const [kennung] = rest;
    for (let n = 1; ; n += 1) {
      await einmal(kennung, n);
      process.stdout.write(`${n}\n`);
    }
  } else if (modus === "lies") {
    const bis = Date.now() + Number(rest[0]);
    const db = variante === "b" ? oeffneDb(path.join(pfad, DB_DATEI)) : null;
    const befund = { lesungen: 0, verletzt: 0, beispiele: [] };
    while (Date.now() < bis) {
      const s = await liesStand(variante, pfad, db);
      befund.lesungen += 1;
      if (!s.ok) {
        befund.verletzt += 1;
        if (befund.beispiele.length < 3) befund.beispiele.push(s);
      }
    }
    process.stdout.write(`${JSON.stringify(befund)}\n`);
  }
}

if (path.basename(fileURLToPath(import.meta.url)) === path.basename(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
}
