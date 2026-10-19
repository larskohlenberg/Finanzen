// tests/generationen-arbeiter.mjs
// Eigenstaendiger Prozess fuer die Kill- und Nebenlaeufigkeitstests der
// Generationen-Bibliothek.
//   node generationen-arbeiter.mjs <basis> schreibe <anzahl> <kennung>
//   node generationen-arbeiter.mjs <basis> endlos <kennung>
//   node generationen-arbeiter.mjs <basis> lies <millisekunden>
// Jeder Schreibvorgang aendert ZWEI Dateien: eine neue Buchung in
// transaktionen.jsonl und den passenden Eintrag in agent_log.jsonl. Invariante
// fuer jeden Leser: zu jeder Testbuchung genau ein Logeintrag und umgekehrt.
// GEN_HALT=<schritt> laesst den Prozess an diesem Schritt per SIGKILL sterben.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mitLeser, mitSchreiber } from "../app/tools/lib/generationen.mjs";

const halt = (schritt) => {
  if (process.env.GEN_HALT === schritt) process.kill(process.pid, "SIGKILL");
};

const zeilen = (text) => text.split("\n").filter((z) => z.trim()).map((z) => JSON.parse(z));

export function testBuchung(kennung, n) {
  return {
    transaktion_id: `TXN-GEN-${kennung}-${String(n).padStart(5, "0")}`,
    konto_id: "KTO-001",
    buchungsdatum: "2026-10-01",
    betrag: "-1.23",
    gegenpartei: "Testladen",
    verwendungszweck: `Test ${kennung} ${n}`,
  };
}

async function einmal(basis, kennung, n) {
  const b = testBuchung(kennung, n);
  await mitSchreiber(basis, async (tx) => {
    const t = await tx.lies("transaktionen.jsonl");
    await tx.schreibe("transaktionen.jsonl", `${t}${JSON.stringify(b)}\n`);
    const l = await tx.lies("agent_log.jsonl");
    await tx.schreibe("agent_log.jsonl", `${l}${JSON.stringify({ anlass: "gen-test", betroffene_ids: [b.transaktion_id] })}\n`);
  }, { wartenMs: 60000, behalten: 3, halt, wer: "gen-test" });
}

export function pruefeInvariante(transaktionen, log) {
  const ids = new Set(transaktionen.filter((t) => t.transaktion_id?.startsWith("TXN-GEN-")).map((t) => t.transaktion_id));
  const geloggt = log.filter((e) => e.anlass === "gen-test").flatMap((e) => e.betroffene_ids);
  const ohneLog = [...ids].filter((id) => !geloggt.includes(id)).length;
  const ohneBuchung = geloggt.filter((id) => !ids.has(id)).length;
  const doppelt = geloggt.length - new Set(geloggt).size;
  return { buchungen: ids.size, ohneLog, ohneBuchung, doppelt, ok: ohneLog === 0 && ohneBuchung === 0 && doppelt === 0 };
}

export function liesStand(basis) {
  return mitLeser(basis, async (l) => ({
    stand: l.id,
    ...pruefeInvariante(zeilen(await l.lies("transaktionen.jsonl")), zeilen(await l.lies("agent_log.jsonl"))),
  }));
}

async function main([basis, modus, ...rest]) {
  if (modus === "schreibe") {
    const [anzahl, kennung] = rest;
    for (let n = 1; n <= Number(anzahl); n += 1) await einmal(basis, kennung, n);
  } else if (modus === "endlos") {
    for (let n = 1; ; n += 1) await einmal(basis, rest[0], n);
  } else if (modus === "lies") {
    const bis = Date.now() + Number(rest[0]);
    const befund = { lesungen: 0, verletzt: 0, beispiele: [] };
    while (Date.now() < bis) {
      const s = await liesStand(basis);
      befund.lesungen += 1;
      if (!s.ok) {
        befund.verletzt += 1;
        if (befund.beispiele.length < 3) befund.beispiele.push(s);
      }
    }
    process.stdout.write(`${JSON.stringify(befund)}\n`);
  }
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
}
