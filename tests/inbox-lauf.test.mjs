// Inbox-Lauf (tools/inbox.mjs) als Ganzes: erst Bestand schreiben und
// validieren, dann die Quelle archivieren. Ein Abbruch oder eine Rueckrollung
// darf keine Quelle nach processed/ schieben, deren Buchungen fehlen; eine
// Datei mit Zeilenfehlern ist nicht "verarbeitet"; nichts wird ueberschrieben.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const PROFIL = {
  profil_id: "test-lauf",
  quelle: "csv",
  dateimuster: "^lauf.*\\.csv$",
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
  writeFileSync(join(profile, "test-lauf.json"), JSON.stringify(PROFIL));
  return { ...abzug, inbox: join(abzug.app, "data", "inbox") };
}

function csv(...zeilen) {
  return ["Datum;Betrag;Name;Zweck", ...zeilen].join("\n") + "\n";
}

// Realer Pfad: unter macOS ist das Temp-Verzeichnis ein Symlink, und die CLI
// startet nur, wenn argv[1] ihrem eigenen (aufgeloesten) Modulpfad entspricht.
function inboxLauf(abzug, schreiben = true) {
  const r = spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", "inbox.mjs"), abzug.master, ...(schreiben ? ["--schreiben"] : [])], { cwd: abzug.wurzel, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const bericht = (stdout) => JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
const anzahlTransaktionen = (abzug) => readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8").trim().split("\n").length;
const liste = (ordner) => (existsSync(ordner) ? readdirSync(ordner).sort() : []);

test("Schreibfehler am Bestand: die Quelle bleibt in der Inbox statt in processed/", { skip: process.getuid?.() === 0 && "als root greift der Schreibschutz nicht" }, () => {
  const abzug = abzugMitProfil();
  try {
    writeFileSync(join(abzug.inbox, "lauf-1.csv"), csv("01.09.2026;-13,37;Testladen Eins;Einkauf Lauf Eins"));
    chmodSync(join(abzug.master, "transaktionen.jsonl"), 0o444);
    const r = inboxLauf(abzug);
    assert.notEqual(r.status, 0, r.stdout);
    assert.ok(existsSync(join(abzug.inbox, "lauf-1.csv")), "Quelle muss im Inbox-Root liegen bleiben");
    assert.deepEqual(liste(join(abzug.inbox, "processed")), []);
  } finally {
    chmodSync(join(abzug.master, "transaktionen.jsonl"), 0o644);
    abzug.aufraeumen();
  }
});

test("Rueckrollung nach Validierungsfehler (MCP): Bestand unveraendert, Quelle bleibt in der Inbox", async () => {
  // Ausloeser: eine Regel mit kaputter ID (im Bestand schon ein bekannter
  // Fehler) trifft die neue Buchung und traegt sich in deren matched_regeln
  // ein — das ist ein neuer Validatorfehler. Frueher war es eine
  // Hash-Kollision; die gibt es seit dem Abgleich als Multimenge nicht mehr
  // (Review 0A.13, ADR 0034).
  const abzug = abzugMitProfil();
  try {
    const regelnDatei = join(abzug.master, "kategorisierungsregeln.json");
    const regeln = JSON.parse(readFileSync(regelnDatei, "utf8"));
    regeln.push({ regel_id: "REG-X1", gegenpartei_pattern: "Testkiosk", kategorie_id: "KAT-004", status: "aktiv", erstellt_am: "2026-09-01", kommentar: "kaputte ID" });
    writeFileSync(regelnDatei, `${JSON.stringify(regeln, null, 2)}\n`);
    const tx = join(abzug.master, "transaktionen.jsonl");
    const vorher = readFileSync(tx, "utf8");
    writeFileSync(join(abzug.inbox, "lauf-2.csv"), csv("02.09.2026;-4,20;Testkiosk;Kaputte Regel"));

    const s = starteServer(abzug, "schreiben");
    try {
      const r = await s.werkzeug("inbox", { schreiben: true });
      assert.ok(r.isError, r.text);
      assert.match(r.text, /matched_regeln/);
    } finally {
      await s.beenden();
    }
    assert.equal(readFileSync(tx, "utf8"), vorher);
    assert.ok(existsSync(join(abzug.inbox, "lauf-2.csv")), "Quelle muss im Inbox-Root liegen bleiben");
    assert.deepEqual(liste(join(abzug.inbox, "processed")), []);
  } finally {
    abzug.aufraeumen();
  }
});

test("Zeilenfehler: gute Zeilen werden importiert, die Datei landet mit vollstaendiger Fehlernotiz in error/", () => {
  const abzug = abzugMitProfil();
  try {
    const vorher = anzahlTransaktionen(abzug);
    writeFileSync(join(abzug.inbox, "lauf-3.csv"), csv(
      "03.09.2026;-21,00;Testladen Drei;Einkauf Lauf Drei A",
      "kein Datum;-1,00;X;Fehler eins",
      "03.09.2026;12.34;X;Fehler zwei",
      "03.09.2026;;X;Fehler drei",
      "31.02.2026;-2,00;X;Fehler vier",
      "04.09.2026;-22,00;Testladen Drei;Einkauf Lauf Drei B",
    ));

    const vorschau = inboxLauf(abzug, false);
    assert.equal(vorschau.status, 0, vorschau.stderr);
    assert.equal(bericht(vorschau.stdout).laeufe[0].lesefehler_details.length, 4);
    assert.ok(existsSync(join(abzug.inbox, "lauf-3.csv")), "Vorschau verschiebt nichts");

    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    const lauf = bericht(r.stdout).laeufe[0];
    assert.equal(lauf.geschrieben, 2);
    assert.deepEqual(lauf.lesefehler_details.map((f) => f.zeile), [3, 4, 5, 6]);
    assert.equal(lauf.abgelegt, "data/inbox/error/lauf-3.csv");
    assert.equal(anzahlTransaktionen(abzug), vorher + 2);
    assert.ok(!existsSync(join(abzug.inbox, "lauf-3.csv")));
    assert.deepEqual(liste(join(abzug.inbox, "processed")), []);
    const notiz = readFileSync(join(abzug.inbox, "error", "lauf-3.csv.fehler.txt"), "utf8");
    for (const zeile of ["Zeile 3", "Zeile 4", "Zeile 5", "Zeile 6"]) assert.match(notiz, new RegExp(zeile));
    assert.match(notiz, /2 Buchung\(en\) importiert/);

    // Erneuter Lauf nach dem Zurueckholen: die Dublettenpruefung verhindert
    // eine Verdopplung, die Fehlernotiz des ersten Laufs wird nicht ueberschrieben.
    renameSync(join(abzug.inbox, "error", "lauf-3.csv"), join(abzug.inbox, "lauf-3.csv"));
    const nochmal = inboxLauf(abzug);
    assert.equal(nochmal.status, 0, nochmal.stderr);
    assert.equal(bericht(nochmal.stdout).laeufe[0].geschrieben, 0);
    assert.equal(anzahlTransaktionen(abzug), vorher + 2);
    assert.equal(readFileSync(join(abzug.inbox, "error", "lauf-3.csv.fehler.txt"), "utf8"), notiz);
    assert.deepEqual(liste(join(abzug.inbox, "error")), ["lauf-3-2.csv", "lauf-3-2.csv.fehler.txt", "lauf-3.csv.fehler.txt"]);
  } finally {
    abzug.aufraeumen();
  }
});

test("Archivziel ist kollisionsfrei: eine gleichnamige Datei in processed/ wird nicht ueberschrieben", () => {
  const abzug = abzugMitProfil();
  try {
    mkdirSync(join(abzug.inbox, "processed"), { recursive: true });
    writeFileSync(join(abzug.inbox, "processed", "lauf-4.csv"), "alter Auszug\n");
    const neu = csv("05.09.2026;-31,00;Testladen Vier;Einkauf Lauf Vier");
    writeFileSync(join(abzug.inbox, "lauf-4.csv"), neu);

    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(bericht(r.stdout).laeufe[0].abgelegt, "data/inbox/processed/lauf-4-2.csv");
    assert.equal(readFileSync(join(abzug.inbox, "processed", "lauf-4.csv"), "utf8"), "alter Auszug\n");
    assert.equal(readFileSync(join(abzug.inbox, "processed", "lauf-4-2.csv"), "utf8"), neu);
  } finally {
    abzug.aufraeumen();
  }
});

test("eine Datei, die das Profil nicht lesen kann, landet mit Fehlernotiz in error/", () => {
  const abzug = abzugMitProfil();
  try {
    writeFileSync(join(abzug.inbox, "lauf-5.csv"), "Datum;Betrag;Name\n06.09.2026;-1,00;X\n");
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(abzug.inbox, "error", "lauf-5.csv")));
    assert.match(readFileSync(join(abzug.inbox, "error", "lauf-5.csv.fehler.txt"), "utf8"), /Zweck/);
  } finally {
    abzug.aufraeumen();
  }
});

test("Dubletten-Prueffaelle landen im Protokoll des Laufs (fuer den Pruefbericht)", () => {
  const abzug = abzugMitProfil();
  try {
    const zeile = "02.09.2026;-7,50;Testladen Zwei;Einkauf Lauf Zwei";
    writeFileSync(join(abzug.inbox, "lauf-a.csv"), csv(zeile));
    assert.equal(inboxLauf(abzug).status, 0);
    writeFileSync(join(abzug.inbox, "lauf-b.csv"), csv(zeile, zeile));
    const r = inboxLauf(abzug);
    assert.equal(r.status, 0, r.stderr);
    const log = readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const letzter = log.at(-1);
    assert.equal(letzter.anlass, "inbox-lauf");
    assert.equal(letzter.dubletten_pruefen.length, 1);
    assert.equal(letzter.dubletten_pruefen[0].art, "teilweise_vorhanden");
    assert.equal(letzter.dubletten_pruefen[0].quelle, "data/inbox/lauf-b.csv");
    assert.equal(log.at(-2).dubletten_pruefen, undefined, "Lauf ohne Prueffaelle traegt das Feld nicht");
  } finally {
    abzug.aufraeumen();
  }
});

test("import.mjs protokolliert Dubletten-Prueffaelle beim Schreiben (fuer den Pruefbericht)", () => {
  const abzug = legeAbzugAn();
  try {
    const eintrag = JSON.stringify({ konto_id: "KTO-001", buchungsdatum: "2026-09-05", betrag: "-4.20", gegenpartei: "Testbaecker", verwendungszweck: "Broetchen", rohquelle: "data/inbox/imp.jsonl" });
    const lauf = (datei) => spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", "import.mjs"), datei, abzug.master, "--schreiben"], { cwd: abzug.wurzel, encoding: "utf8" });
    const logZeilen = () => readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const vorher = logZeilen().length;
    writeFileSync(join(abzug.wurzel, "a.jsonl"), `${eintrag}\n`);
    assert.equal(lauf("a.jsonl").status, 0);
    assert.equal(logZeilen().length, vorher, "Lauf ohne Prueffaelle schreibt keinen Protokolleintrag");
    writeFileSync(join(abzug.wurzel, "b.jsonl"), `${eintrag}\n${eintrag}\n`);
    const r = lauf("b.jsonl");
    assert.equal(r.status, 0, r.stderr);
    const log = logZeilen();
    assert.equal(log.length, vorher + 1);
    assert.equal(log.at(-1).anlass, "import");
    assert.equal(log.at(-1).dubletten_pruefen[0].art, "teilweise_vorhanden");
    assert.equal(log.at(-1).dubletten_pruefen[0].quelle, "b.jsonl");
  } finally {
    abzug.aufraeumen();
  }
});
