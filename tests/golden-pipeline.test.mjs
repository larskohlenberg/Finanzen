// Golden-Pipeline auf Demodaten (Review Welle 2, 2.4): Roh-CSV -> Inbox ->
// Freigabe -> Kennzahlen, als Ablauf mit festen Erwartungswerten. Dazu zwei
// Ablaeufe: derselbe Auszug noch einmal (ueberlappender Import) und Regel
// aendern -> freigeben.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { legeAbzugAn } from "./mcp-hilfe.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";
import { kontenGruppen } from "../app/uebersicht-rechnung.mjs";
import { computeLiquiditaetIst } from "../app/liquiditaet.mjs";
import { computeNettovermoegen } from "../app/vermoegen.mjs";
import { kennzahlenText } from "../app/mcp/kennzahlen.mjs";

const PROFIL = {
  profil_id: "golden", quelle: "csv", dateimuster: "^golden.*\\.csv$", konto_id: "KTO-001", trennzeichen: ";", kopfzeile: "Datum",
  datumsformat: "DD.MM.YYYY", dezimal: ",",
  felder: { buchungsdatum: { spalte: "Datum" }, betrag: { spalte: "Betrag" }, gegenpartei: { spalte: "Name" }, verwendungszweck: { spalte: "Zweck" } },
};
// Erfundene Zeilen: Gehalt (Regel REG-002), Supermarkt (REG-001), unbekannter Haendler.
const CSV = ["Datum;Betrag;Name;Zweck", "01.07.2026;3.250,00;Muster GmbH;Gehalt Juli", "03.07.2026;-84,17;MusterladenA;Einkauf", "05.07.2026;-19,99;Unbekannter Haendler XY;Bestellung 4711"].join("\n") + "\n";
const STICHTAG = "2026-07-10";

const lauf = (abzug, werkzeug, ...args) => {
  const r = spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", werkzeug), abzug.master, ...args], { cwd: abzug.wurzel, encoding: "utf8" });
  assert.equal(r.status, 0, `${werkzeug}: ${r.stdout}\n${r.stderr}`);
  return r.stdout;
};
const bericht = (stdout) => JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
const bestand = (abzug) => loadMasterData(pathToFileURL(`${abzug.master}/`));
const neue = (data) => data.transaktionen.filter((t) => t.konto_id === "KTO-001" && t.buchungsdatum >= "2026-07-01").sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum));

test("Golden-Pipeline: Roh-CSV -> Inbox -> Freigabe -> Kennzahlen", async (t) => {
  const abzug = legeAbzugAn();
  t.after(() => abzug.aufraeumen());
  mkdirSync(join(abzug.app, "data", "import-profile"), { recursive: true });
  writeFileSync(join(abzug.app, "data", "import-profile", "golden.json"), JSON.stringify(PROFIL));
  const vorher = await bestand(abzug);
  const geldVorher = kontenGruppen(vorher, STICHTAG).konten.summe_cents;
  const nettoVorher = computeNettovermoegen(vorher, STICHTAG).netto_cents;

  // 1. Inbox: drei Zeilen gelesen und geschrieben, Datei archiviert.
  writeFileSync(join(abzug.app, "data", "inbox", "golden-1.csv"), CSV);
  const inbox = bericht(lauf(abzug, "inbox.mjs", "--schreiben"));
  assert.deepEqual(inbox.laeufe.map((l) => [l.gelesen, l.geschrieben, l.uebersprungen_dedupe, l.importfehler, l.abgelegt]), [[3, 3, 0, 0, "data/inbox/processed/golden-1.csv"]]);
  let data = await bestand(abzug);
  assert.deepEqual(neue(data).map((x) => [x.buchungsdatum, x.betrag, x.kategorie_id ?? "", x.kategorisierung_status, x.kategorie_herkunft ?? ""]), [
    ["2026-07-01", "3250.00", "KAT-001", "vorgeschlagen", "regel"],
    ["2026-07-03", "-84.17", "KAT-004", "vorgeschlagen", "regel"],
    ["2026-07-05", "-19.99", "", "offen", ""],
  ]);

  // 2. Freigabe: die Demoregeln haben keine Belegstufe -> das Gate haelt zurueck.
  const freigabe = lauf(abzug, "freigabe.mjs", "--schreiben");
  assert.match(freigabe, /Freigegeben ueber Regeln: 0/);
  assert.match(freigabe, /REG-001: belegstufe/);
  assert.match(freigabe, /REG-002: belegstufe/);
  lauf(abzug, "validator.mjs");

  // 3. Kennzahlen: Verfuegbares Geld, Liquiditaet und Netto steigen genau um die Summe der Zeilen.
  data = await bestand(abzug);
  const summe = 325000 - 8417 - 1999;
  assert.equal(kontenGruppen(data, STICHTAG).konten.summe_cents, geldVorher + summe);
  assert.equal(computeLiquiditaetIst(data, { today: STICHTAG }).saldo_cents, geldVorher + summe);
  assert.equal(computeNettovermoegen(data, STICHTAG).netto_cents, nettoVorher + summe);
  const text = kennzahlenText({ ...data, checks: [] }, STICHTAG);
  assert.match(text, new RegExp(`Verfuegbares Geld: ${((geldVorher + summe) / 100).toFixed(2)} EUR`));

  // 4. Derselbe Auszug noch einmal (ueberlappender Import): nichts Neues.
  copyFileSync(join(abzug.app, "data", "inbox", "processed", "golden-1.csv"), join(abzug.app, "data", "inbox", "golden-2.csv"));
  const zweiter = bericht(lauf(abzug, "inbox.mjs", "--schreiben"));
  assert.deepEqual(zweiter.laeufe.map((l) => [l.gelesen, l.geschrieben, l.uebersprungen_dedupe]), [[3, 0, 3]]);
  assert.equal(neue(await bestand(abzug)).length, 3);

  // 5. Regel aendern (Belegstufe nachtragen) -> freigeben: jetzt bestaetigt.
  const regelPfad = join(abzug.master, "kategorisierungsregeln.json");
  const regeln = JSON.parse(readFileSync(regelPfad, "utf8")).map((r) => (["REG-001", "REG-002"].includes(r.regel_id) ? { ...r, belegstufe: "E3" } : r));
  writeFileSync(regelPfad, `${JSON.stringify(regeln, null, 2)}\n`);
  const zweiteFreigabe = lauf(abzug, "freigabe.mjs", "--schreiben");
  assert.match(zweiteFreigabe, /Freigegeben ueber Regeln: [1-9]/);
  lauf(abzug, "validator.mjs");
  data = await bestand(abzug);
  assert.deepEqual(neue(data).map((x) => x.kategorisierung_status), ["bestaetigt", "bestaetigt", "offen"]);
  // Die Freigabe aendert keine Betraege: Kennzahlen bleiben gleich.
  assert.equal(kontenGruppen(data, STICHTAG).konten.summe_cents, geldVorher + summe);
});
