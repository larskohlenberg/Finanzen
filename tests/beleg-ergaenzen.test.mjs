// beleg_ergaenzen: nachgereichte Seiten aus der Inbox in einen abgelegten Beleg
// einfuegen, z. B. eine vergessene Rueckseite. Die alte Fassung samt Zwilling
// und die Inbox-Datei wandern in den Papierkorb. Nie ueberschreiben ohne Kopie.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { localTodayIso } from "../app/liquiditaet.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";
import { musterPdf } from "./pdf-muster.mjs";

const hat = (befehl) => { try { execFileSync("which", [befehl], { stdio: "ignore" }); return true; } catch { return false; } };
const POPPLER = ["pdfinfo", "pdfseparate", "pdfunite", "pdftotext"].every(hat);

// Gleiche Laenge wie "Seite", damit die Stream-Laenge im Muster stimmt.
const extraPdf = (seiten) => musterPdf(seiten).replaceAll("(Seite ", "(Extra ");

let abzug;
let inbox;
let ordner;
before(() => {
  abzug = legeAbzugAn();
  inbox = join(abzug.app, "data", "inbox");
  ordner = join(abzug.app, "Belege", "Vorsorge", "VS-001_Muster", "2026");
  mkdirSync(ordner, { recursive: true });
  mkdirSync(join(inbox, "standardized"), { recursive: true });
});
after(() => abzug.aufraeumen());

const text = (datei) => execFileSync("pdftotext", ["-layout", datei, "-"], { encoding: "utf8" });

test("beleg_ergaenzen: Vorschau aendert nichts, Schreiben fuegt nach der Seite ein", { skip: !POPPLER && "poppler fehlt" }, async () => {
  writeFileSync(join(ordner, "brief.pdf"), musterPdf(3));
  writeFileSync(join(ordner, "brief.txt"), "alter Zwilling\n");
  writeFileSync(join(inbox, "nachtrag.pdf"), extraPdf(1));
  writeFileSync(join(inbox, "standardized", "nachtrag.txt"), "Vorlauf\n");
  const s = starteServer(abzug, "schreiben");
  try {
    const args = { quelle: "data/inbox/nachtrag.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/brief.pdf", nach_seite: 1 };
    const vorschau = await s.werkzeug("beleg_ergaenzen", args);
    assert.ok(!vorschau.isError, vorschau.text);
    assert.match(vorschau.text, /Vorschau/);
    assert.match(vorschau.text, /3 \+ 1 = 4 Seiten/);
    assert.ok(existsSync(join(inbox, "nachtrag.pdf")));
    assert.doesNotMatch(text(join(ordner, "brief.pdf")), /Extra/);

    const r = await s.werkzeug("beleg_ergaenzen", { ...args, schreiben: true });
    assert.ok(!r.isError, r.text);
    assert.match(text(join(ordner, "brief.pdf")), /Seite 1[\s\S]*Extra 1[\s\S]*Seite 2[\s\S]*Seite 3/);
    // Der alte Zwilling passt nicht mehr: weg aus Belege/, belege_text legt ihn neu an.
    assert.ok(!existsSync(join(ordner, "brief.txt")));
    assert.ok(!existsSync(join(inbox, "nachtrag.pdf")));

    const korb = join(abzug.app, "data", "papierkorb", localTodayIso());
    const alt = join(korb, "Belege", "Vorsorge", "VS-001_Muster", "2026");
    assert.doesNotMatch(text(join(alt, "brief.pdf")), /Extra/);
    assert.equal(readFileSync(join(alt, "brief.txt"), "utf8"), "alter Zwilling\n");
    assert.ok(existsSync(join(korb, "nachtrag.pdf")));
    assert.equal(readFileSync(join(korb, "standardized", "nachtrag.txt"), "utf8"), "Vorlauf\n");

    const eintrag = readFileSync(join(abzug.master, "agent_log.jsonl"), "utf8").trim().split("\n").map((z) => JSON.parse(z)).at(-1);
    assert.equal(eintrag.anlass, "beleg-ergaenzen");
    assert.equal(eintrag.nach_seite, 1);
    assert.equal(eintrag.seiten, 4);
  } finally {
    await s.beenden();
  }
});

test("beleg_ergaenzen: ohne nach_seite ans Ende, mit 0 nach vorn", { skip: !POPPLER && "poppler fehlt" }, async () => {
  writeFileSync(join(ordner, "ende.pdf"), musterPdf(2));
  writeFileSync(join(inbox, "hinten.pdf"), extraPdf(2));
  writeFileSync(join(ordner, "vorn.pdf"), musterPdf(2));
  writeFileSync(join(inbox, "deckblatt.pdf"), extraPdf(1));
  const s = starteServer(abzug, "schreiben");
  try {
    const hinten = await s.werkzeug("beleg_ergaenzen", { quelle: "data/inbox/hinten.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/ende.pdf", schreiben: true });
    assert.ok(!hinten.isError, hinten.text);
    assert.match(text(join(ordner, "ende.pdf")), /Seite 1[\s\S]*Seite 2[\s\S]*Extra 1[\s\S]*Extra 2/);
    const vorn = await s.werkzeug("beleg_ergaenzen", { quelle: "data/inbox/deckblatt.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/vorn.pdf", nach_seite: 0, schreiben: true });
    assert.ok(!vorn.isError, vorn.text);
    assert.match(text(join(ordner, "vorn.pdf")), /Extra 1[\s\S]*Seite 1[\s\S]*Seite 2/);
  } finally {
    await s.beenden();
  }
});

test("beleg_ergaenzen: falsche Seite, fehlendes Ziel, Nicht-PDF und fremde Pfade werden abgewiesen", { skip: !POPPLER && "poppler fehlt" }, async () => {
  writeFileSync(join(ordner, "kurz.pdf"), musterPdf(2));
  writeFileSync(join(inbox, "blatt.pdf"), extraPdf(1));
  writeFileSync(join(inbox, "notiz.txt"), "kein PDF");
  const s = starteServer(abzug, "schreiben");
  try {
    for (const [args, grund] of [
      [{ quelle: "data/inbox/blatt.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/kurz.pdf", nach_seite: 3 }, /Seite 3 gibt es nicht/],
      [{ quelle: "data/inbox/blatt.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/fehlt.pdf" }, /keine Datei/],
      [{ quelle: "data/inbox/notiz.txt", ziel: "Belege/Vorsorge/VS-001_Muster/2026/kurz.pdf" }, /kein PDF/],
      [{ quelle: "data/inbox/blatt.pdf", ziel: "data/master/konten.json" }, /.+/],
      [{ quelle: "Belege/Vorsorge/VS-001_Muster/2026/kurz.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/kurz.pdf" }, /.+/],
    ]) {
      const r = await s.werkzeug("beleg_ergaenzen", { ...args, schreiben: true });
      assert.equal(r.isError, true, JSON.stringify(args));
      assert.match(r.text, grund);
    }
    assert.doesNotMatch(text(join(ordner, "kurz.pdf")), /Extra/);
    assert.ok(existsSync(join(inbox, "blatt.pdf")));
  } finally {
    await s.beenden();
  }
});

test("beleg_ergaenzen nur mit Schreibrecht", async () => {
  const s = starteServer(abzug, "lesen");
  try {
    const r = await s.werkzeug("beleg_ergaenzen", { quelle: "data/inbox/blatt.pdf", ziel: "Belege/Vorsorge/VS-001_Muster/2026/kurz.pdf" });
    assert.equal(r.isError, true);
  } finally {
    await s.beenden();
  }
});
