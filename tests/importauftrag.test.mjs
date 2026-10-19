// tests/importauftrag.test.mjs
// 1B.5: Import als wiederaufnehmbarer Auftrag. Jeder CSV-Lauf hinterlaesst im
// Bestand einen Auftrag (Quelle, Pruefsumme, Profil, angenommene/abgewiesene
// Zeilen, Status, Archivziel) — in derselben Generation wie die Buchungen.
// Liegt die Quelle danach noch in der Inbox, wird nur archiviert; wurde sie
// archiviert, ohne dass der Bestand uebernommen wurde, kommt sie zurueck.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { legeAbzugAn } from "./mcp-hilfe.mjs";
import { pathToFileURL } from "node:url";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";
import { runImport } from "../app/tools/import.mjs";
import { importStandModell } from "../app/tools/lib/importstand.mjs";

const PROFIL = {
  profil_id: "test-auftrag",
  quelle: "csv",
  dateimuster: "^auftrag.*\\.csv$",
  konto_id: "KTO-005",
  trennzeichen: ";",
  kopfzeile: "Datum",
  datumsformat: "DD.MM.YYYY",
  dezimal: ",",
  felder: {
    buchungsdatum: { spalte: "Datum" },
    betrag: { spalte: "Betrag" },
    gegenpartei: { spalte: "Name" },
    verwendungszweck: { spalte: "Zweck" },
  },
};

function abzugMitProfil() {
  const abzug = legeAbzugAn();
  const profile = join(abzug.app, "data", "import-profile");
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "test-auftrag.json"), JSON.stringify(PROFIL));
  return { ...abzug, inbox: join(abzug.app, "data", "inbox") };
}

const csv = (...zeilen) => ["Datum;Betrag;Name;Zweck", ...zeilen].join("\n") + "\n";
const sha = (text) => createHash("sha256").update(text).digest("hex");
function inboxLauf(abzug, schreiben = true) {
  const r = spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", "inbox.mjs"), abzug.master, ...(schreiben ? ["--schreiben"] : [])], { cwd: abzug.wurzel, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const bericht = (stdout) => JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
const auftraege = (abzug) => {
  const datei = join(abzug.master, "importauftraege.jsonl");
  return existsSync(datei) ? readFileSync(datei, "utf8").trim().split("\n").filter(Boolean).map((z) => JSON.parse(z)) : [];
};
const anzahlTransaktionen = (abzug) => readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8").trim().split("\n").length;

test("Inbox-Lauf legt einen Auftrag an: Quelle, Pruefsumme, Profil, Zeilen, Status, Archiv", async () => {
  const abzug = abzugMitProfil();
  try {
    const inhalt = csv(
      "05.09.2026;-11,00;Testladen Auftrag;Einkauf A",
      "kein Datum;-1,00;X;kaputt",
      "06.09.2026;-12,00;Testladen Auftrag;Einkauf B",
    );
    writeFileSync(join(abzug.inbox, "auftrag-1.csv"), inhalt);
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    const [a] = auftraege(abzug);
    assert.ok(a, "Auftrag fehlt");
    assert.match(a.auftrag_id, /^IMP-\d{3,}$/);
    assert.equal(a.quelle, "data/inbox/auftrag-1.csv");
    assert.equal(a.quelle_sha256, sha(inhalt));
    assert.equal(a.profil_id, "test-auftrag");
    assert.equal(a.konto_id, "KTO-005");
    assert.equal(a.status, "teilweise");
    assert.deepEqual(a.zeilen, { gelesen: 3, uebernommen: 2, dubletten: 0, abgewiesen: 1 });
    assert.equal(a.abgewiesen.length, 1);
    assert.equal(a.abgewiesen[0].zeile, 3);
    assert.equal(a.archiv, "data/inbox/error/auftrag-1.csv");
    assert.equal(bericht(r.stdout).laeufe[0].auftrag_id, a.auftrag_id);
    const v = validateMasterData(await loadMasterData(pathToFileURL(`${abzug.master}/`)));
    assert.equal(v.befunde.filter((b) => b.sammlung === "importauftraege").length, 0);
  } finally {
    abzug.aufraeumen();
  }
});

test("Wiederaufnahme: Auftrag uebernommen, Quelle noch in der Inbox -> nur archivieren, nichts doppelt", () => {
  const abzug = abzugMitProfil();
  try {
    const inhalt = csv("07.09.2026;-13,00;Testladen Auftrag;Einkauf C");
    writeFileSync(join(abzug.inbox, "auftrag-2.csv"), inhalt);
    assert.equal(inboxLauf(abzug).status, 0);
    const n = anzahlTransaktionen(abzug);
    // Abbruch nach der Uebernahme nachstellen: Quelle zurueck in die Inbox.
    renameSync(join(abzug.inbox, "processed", "auftrag-2.csv"), join(abzug.inbox, "auftrag-2.csv"));
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    const lauf = bericht(r.stdout).laeufe[0];
    assert.equal(lauf.wiederaufgenommen, auftraege(abzug)[0].auftrag_id);
    assert.equal(anzahlTransaktionen(abzug), n);
    assert.equal(auftraege(abzug).length, 1);
    assert.ok(existsSync(join(abzug.inbox, "processed", "auftrag-2.csv")));
    assert.ok(!existsSync(join(abzug.inbox, "auftrag-2.csv")));
  } finally {
    abzug.aufraeumen();
  }
});

test("Wiederanlauf: archiviert, aber Bestand nicht uebernommen -> Quelle kommt zurueck und wird importiert", () => {
  const abzug = abzugMitProfil();
  try {
    const inhalt = csv("08.09.2026;-14,00;Testladen Auftrag;Einkauf D");
    mkdirSync(join(abzug.inbox, "processed"), { recursive: true });
    writeFileSync(join(abzug.inbox, "processed", "auftrag-3.csv"), inhalt);
    // Marke des abgebrochenen Laufs: Auftrag IMP-001 gibt es im Bestand nicht.
    mkdirSync(join(abzug.inbox, ".auftraege"), { recursive: true });
    writeFileSync(join(abzug.inbox, ".auftraege", `${sha(inhalt)}.json`), JSON.stringify({ auftrag_id: "IMP-001", quelle_sha256: sha(inhalt), quelle: "data/inbox/auftrag-3.csv", archiv: "data/inbox/processed/auftrag-3.csv" }));
    const n = anzahlTransaktionen(abzug);
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(anzahlTransaktionen(abzug), n + 1);
    assert.equal(auftraege(abzug).length, 1);
    assert.deepEqual(bericht(r.stdout).zurueckgeholt, ["data/inbox/processed/auftrag-3.csv"]);
    assert.ok(existsSync(join(abzug.inbox, "processed", "auftrag-3.csv")));
  } finally {
    abzug.aufraeumen();
  }
});

test("Marke eines uebernommenen Auftrags wird beim naechsten Lauf weggeraeumt", () => {
  const abzug = abzugMitProfil();
  try {
    writeFileSync(join(abzug.inbox, "auftrag-4.csv"), csv("09.09.2026;-15,00;Testladen Auftrag;Einkauf E"));
    assert.equal(inboxLauf(abzug).status, 0);
    assert.equal(readdirSync(join(abzug.inbox, ".auftraege")).length, 1);
    assert.equal(inboxLauf(abzug).status, 0);
    assert.equal(readdirSync(join(abzug.inbox, ".auftraege")).length, 0);
  } finally {
    abzug.aufraeumen();
  }
});

test("Validator: Auftraege mit bekanntem Konto und erlaubtem Status", () => {
  const basis = {
    personen: [{ person_id: "PER-001", name: "T", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "K", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv", bank_referenz_verlaesslich: false }],
    kategorien: [], transaktionen: [], transfers: [],
  };
  const auftrag = { auftrag_id: "IMP-001", zeitpunkt: "2026-10-20T01:02:03.000Z", quelle: "data/inbox/a.csv", quelle_sha256: "a".repeat(64), profil_id: "p", konto_id: "KTO-001", status: "uebernommen", zeilen: { gelesen: 1, uebernommen: 1, dubletten: 0, abgewiesen: 0 }, abgewiesen: [], archiv: "data/inbox/processed/a.csv" };
  assert.equal(validateMasterData({ ...basis, importauftraege: [auftrag] }).valid, true, validateMasterData({ ...basis, importauftraege: [auftrag] }).errors.join("; "));
  assert.equal(validateMasterData({ ...basis, importauftraege: [{ ...auftrag, status: "fertig" }] }).valid, false);
  assert.equal(validateMasterData({ ...basis, importauftraege: [{ ...auftrag, konto_id: "KTO-999" }] }).valid, false);
  assert.equal(validateMasterData({ ...basis, importauftraege: [{ ...auftrag, zeilen: { gelesen: 1 } }] }).valid, false);
});

test("Referenz-Verlaesslichkeit je Konto: bank_referenz_verlaesslich=false schaltet den Referenzabgleich ab", () => {
  const konto = { konto_id: "KTO-001", name: "K", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" };
  const bestandTx = { transaktion_id: "TXN-11111111-1111-4111-8111-111111111111", dedupe_hash: "x", rohquelle: "r", konto_id: "KTO-001", buchungsdatum: "2026-01-05", betrag: "-10.00", gegenpartei: "Laden", verwendungszweck: "Alt", bank_referenz: "R1", kategorisierung_status: "offen", ist_transfer: false };
  const neu = { rohquelle: "r2", konto_id: "KTO-001", buchungsdatum: "2026-01-05", betrag: "-10.00", gegenpartei: "Laden", verwendungszweck: "Anders", bank_referenz: "R1" };
  const mit = runImport({ entries: [neu], konten: [konto], kategorien: [], kategorisierungsregeln: [], transaktionen: [bestandTx], transfers: [] });
  assert.equal(mit.result.written.length, 0, "verlaessliche Referenz: als vorhanden erkannt");
  const ohne = runImport({ entries: [neu], konten: [{ ...konto, bank_referenz_verlaesslich: false }], kategorien: [], kategorisierungsregeln: [], transaktionen: [bestandTx], transfers: [] });
  assert.equal(ohne.result.written.length, 1, "Referenz zaehlt nicht: neue Buchung");
  assert.deepEqual(ohne.result.referenz_unzuverlaessig, ["KTO-001"]);
});

test("importStandModell: wartende Dateien und letzte Auftraege fuer die Oberflaeche", () => {
  const a = (id, status, zeit, extra = {}) => ({ auftrag_id: id, zeitpunkt: zeit, quelle: `data/inbox/${id}.csv`, quelle_sha256: id.padEnd(64, "0").toLowerCase().replace(/[^0-9a-f]/g, "0"), profil_id: "p", status, zeilen: { gelesen: 2, uebernommen: 1, dubletten: 0, abgewiesen: 1 }, abgewiesen: [{ zeile: 3, grund: "Datum" }], archiv: `data/inbox/processed/${id}.csv`, ...extra });
  const modell = importStandModell({
    auftraege: [a("IMP-001", "uebernommen", "2026-10-01T00:00:00Z"), a("IMP-002", "teilweise", "2026-10-02T00:00:00Z")],
    wartend: [{ datei: "neu.csv" }, { datei: "IMP-002.csv", sha256: a("IMP-002", "teilweise", "").quelle_sha256 }],
  });
  assert.equal(modell.auftraege[0].auftrag_id, "IMP-002", "neueste zuerst");
  assert.equal(modell.auftraege[0].abgewiesen.length, 1);
  assert.deepEqual(modell.wartend.map((w) => [w.datei, w.status]), [["neu.csv", "hochgeladen"], ["IMP-002.csv", "uebernommen-archiv-ausstehend"]]);
  assert.deepEqual(modell.summe, { auftraege: 2, teilweise: 1, abgewiesen: 0, wartend: 2 });
});

test("MCP status nennt den Importbericht", async () => {
  const { starteServer } = await import("./mcp-hilfe.mjs");
  const abzug = abzugMitProfil();
  try {
    writeFileSync(join(abzug.inbox, "auftrag-5.csv"), csv("10.09.2026;-16,00;Testladen Auftrag;Einkauf F", "x;y;z;w"));
    assert.equal(inboxLauf(abzug).status, 0);
    writeFileSync(join(abzug.inbox, "auftrag-6.csv"), csv("11.09.2026;-17,00;Testladen Auftrag;Einkauf G"));
    const s = starteServer(abzug, "lesen");
    try {
      const r = await s.werkzeug("status", {});
      const st = JSON.parse(r.text);
      assert.equal(st.importe.summe.auftraege, 1);
      assert.equal(st.importe.letzte[0].status, "teilweise");
      assert.deepEqual(st.importe.letzte[0].abgewiesen_zeilen, [3]);
      assert.deepEqual(st.importe.wartend, [{ datei: "auftrag-6.csv", status: "hochgeladen" }]);
      assert.equal(st.inbox.dateien[0].sha256, undefined);
    } finally {
      await s.beenden();
    }
  } finally {
    abzug.aufraeumen();
  }
});
