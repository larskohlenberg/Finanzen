// beleg_teilen: einen Sammelscan in der Inbox in einzelne PDFs zerlegen. Jede
// Seite gehoert genau einem Teil, die Teile landen in der Inbox-Wurzel, das
// Original wandert in den Papierkorb. Nie ueberschreiben.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { localTodayIso } from "../app/liquiditaet.mjs";
import { leseSeiten, planeTeilung } from "../app/tools/lib/seiten.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";
import { musterPdf } from "./pdf-muster.mjs";

const hat = (befehl) => { try { execFileSync("which", [befehl], { stdio: "ignore" }); return true; } catch { return false; } };
const POPPLER = ["pdfinfo", "pdfseparate", "pdfunite", "pdftotext"].every(hat);

test("leseSeiten: Bereiche, Einzelseiten, Listen; Unsinn wirft", () => {
  assert.deepEqual(leseSeiten("1-4"), [1, 2, 3, 4]);
  assert.deepEqual(leseSeiten("5"), [5]);
  assert.deepEqual(leseSeiten("1-2, 7"), [1, 2, 7]);
  for (const falsch of ["", "0", "3-1", "a-b", "1-"]) assert.throws(() => leseSeiten(falsch), falsch);
});

test("planeTeilung: jede Seite genau einmal, sonst alle Fehler auf einmal", () => {
  assert.deepEqual(planeTeilung(3, [{ seiten: "1-2", name: "a.pdf" }, { seiten: "3", name: "b.pdf" }]), [
    { name: "a.pdf", seiten: [1, 2] },
    { name: "b.pdf", seiten: [3] },
  ]);
  assert.throws(() => planeTeilung(4, [{ seiten: "1-2", name: "a.pdf" }, { seiten: "2-3", name: "b.pdf" }]), /Seite 2 gehoert schon zu a\.pdf[\s\S]*Seiten ohne Teil: 4/);
  assert.throws(() => planeTeilung(2, [{ seiten: "1-3", name: "a.pdf" }]), /Seite 3 gibt es nicht/);
  // Riesige Bereiche werden vor dem Auffalten abgewiesen.
  assert.throws(() => leseSeiten("1-999999999", 12), /Seite 999999999 gibt es nicht/);
});

let abzug;
let inbox;
before(() => {
  abzug = legeAbzugAn();
  inbox = join(abzug.app, "data", "inbox");
});
after(() => abzug.aufraeumen());

test("beleg_teilen: Vorschau aendert nichts, Schreiben zerlegt und verwirft das Original", { skip: !POPPLER && "poppler fehlt" }, async () => {
  mkdirSync(join(inbox, "standardized"), { recursive: true });
  writeFileSync(join(inbox, "sammel.pdf"), musterPdf(5));
  writeFileSync(join(inbox, "standardized", "sammel.txt"), "Vorlauf\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const teile = [{ seiten: "1-2", name: "brief-a.pdf" }, { seiten: "3", name: "brief-b.pdf" }, { seiten: "4-5", name: "brief-c.pdf" }];
    const vorschau = await s.werkzeug("beleg_teilen", { quelle: "data/inbox/sammel.pdf", teile });
    assert.ok(!vorschau.isError, vorschau.text);
    assert.match(vorschau.text, /Vorschau \(5 Seiten/);
    assert.ok(!existsSync(join(inbox, "brief-a.pdf")));
    assert.ok(existsSync(join(inbox, "sammel.pdf")));

    const r = await s.werkzeug("beleg_teilen", { quelle: "data/inbox/sammel.pdf", teile, schreiben: true });
    assert.ok(!r.isError, r.text);
    const text = (datei) => execFileSync("pdftotext", [join(inbox, datei), "-"], { encoding: "utf8" });
    assert.match(text("brief-a.pdf"), /Seite 1[\s\S]*Seite 2/);
    assert.doesNotMatch(text("brief-a.pdf"), /Seite 3/);
    assert.equal(text("brief-b.pdf").trim(), "Seite 3");
    assert.match(text("brief-c.pdf"), /Seite 4[\s\S]*Seite 5/);
    const korb = join(abzug.app, "data", "papierkorb", localTodayIso());
    assert.ok(existsSync(join(korb, "sammel.pdf")));
    assert.equal(readFileSync(join(korb, "standardized", "sammel.txt"), "utf8"), "Vorlauf\n");
    assert.ok(!existsSync(join(inbox, "sammel.pdf")));

    const eintrag = readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z)).at(-1);
    assert.equal(eintrag.anlass, "beleg-teilen");
    assert.deepEqual(eintrag.teile.map((t) => t.seiten), [[1, 2], [3], [4, 5]]);
  } finally {
    await s.beenden();
  }
});

test("beleg_teilen: Luecken, Doppelte, vorhandene Ziele und Pfade werden abgewiesen", { skip: !POPPLER && "poppler fehlt" }, async () => {
  writeFileSync(join(inbox, "zwei.pdf"), musterPdf(3));
  writeFileSync(join(inbox, "da.pdf"), "%PDF-1.4 bleibt");
  const s = starteServer(abzug, "schreiben");
  try {
    for (const [teile, grund] of [
      [[{ seiten: "1", name: "x.pdf" }, { seiten: "2", name: "y.pdf" }], /Seiten ohne Teil: 3/],
      [[{ seiten: "1-2", name: "x.pdf" }, { seiten: "2-3", name: "y.pdf" }], /gehoert schon/],
      [[{ seiten: "1", name: "x.pdf" }, { seiten: "2-3", name: "X.pdf" }], /eigenen Dateinamen/],
      [[{ seiten: "1", name: "da.pdf" }, { seiten: "2-3", name: "y.pdf" }], /existiert bereits/],
      [[{ seiten: "1", name: "../x.pdf" }, { seiten: "2-3", name: "y.pdf" }], /Format/],
    ]) {
      const r = await s.werkzeug("beleg_teilen", { quelle: "data/inbox/zwei.pdf", teile, schreiben: true });
      assert.equal(r.isError, true, JSON.stringify(teile));
      assert.match(r.text, grund);
    }
    assert.equal(readFileSync(join(inbox, "da.pdf"), "utf8"), "%PDF-1.4 bleibt");
    assert.ok(existsSync(join(inbox, "zwei.pdf")));
    const fremd = await s.werkzeug("beleg_teilen", { quelle: "data/master/konten.json", teile: [{ seiten: "1", name: "a.pdf" }, { seiten: "2", name: "b.pdf" }] });
    assert.equal(fremd.isError, true);
  } finally {
    await s.beenden();
  }
});

test("beleg_teilen nur mit Schreibrecht", async () => {
  const s = starteServer(abzug, "lesen");
  try {
    const r = await s.werkzeug("beleg_teilen", { quelle: "data/inbox/zwei.pdf", teile: [{ seiten: "1", name: "a.pdf" }, { seiten: "2-3", name: "b.pdf" }] });
    assert.equal(r.isError, true);
  } finally {
    await s.beenden();
  }
});
