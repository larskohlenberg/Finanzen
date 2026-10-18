// tests/regelzahlung-matcher.test.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fensterTage, gleicheGegenpartei, markanteWoerter, matchRegelzahlungen } from "../app/tools/regelzahlung-matcher.mjs";

const run = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "app/tools/regelzahlung-matcher.mjs");

let nr = 0;
function tx(konto, datum, betrag, extra = {}) {
  nr++;
  return { transaktion_id: `TXN-${String(nr).padStart(4, "0")}`, konto_id: konto, buchungsdatum: datum, betrag, kategorie_id: "KAT-014", gegenpartei: "Musterversicherung AG", ...extra };
}
function rz(id, betrag, anker, extra = {}) {
  return { regelzahlung_id: id, bezeichnung: `Beitrag ${id}`, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: anker, status: "bestaetigt", kategorie_id: "KAT-014", konto_id: "KTO-001", ...extra };
}
const zugeordnet = (out, id) => out.zuordnungen.filter((z) => z.regelzahlung_id === id).map((z) => z.buchungsdatum);

test("Fenster: monatlich 7, quartalsweise und jaehrlich 15, woechentlich 1 Tag", () => {
  assert.equal(fensterTage({ rhythmus_einheit: "monat", rhythmus_intervall: 1 }), 7);
  assert.equal(fensterTage({ rhythmus_einheit: "monat", rhythmus_intervall: 3 }), 15);
  assert.equal(fensterTage({ rhythmus_einheit: "jahr", rhythmus_intervall: 1 }), 15);
  assert.equal(fensterTage({ rhythmus_einheit: "woche", rhythmus_intervall: 1 }), 1);
});

test("Mandat traegt Beitragsdynamik rueckwaerts ueber mehrere Jahre", () => {
  const m = { mandatsreferenz: "MANDAT-A" };
  const transaktionen = [
    tx("KTO-001", "2024-06-03", "-40.00", m),
    tx("KTO-001", "2025-06-02", "-42.00", m),
    tx("KTO-001", "2026-05-04", "-44.00", m),
    tx("KTO-001", "2026-06-01", "-44.00", m),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-44.00", "2026-06-01")]);
  assert.deepEqual(zugeordnet(out, "RZ-001"), ["2024-06-03", "2025-06-02", "2026-05-04", "2026-06-01"]);
  assert.ok(out.zuordnungen.every((z) => z.signal === "mandat"));
  assert.equal(transaktionen[0].regelzahlung_id, "RZ-001");
  const je = out.je_regelzahlung[0];
  assert.equal(je.anker, transaktionen[3].transaktion_id);
  assert.equal(je.neu, 4);
  assert.equal(je.ohne_buchung, je.termine - 4);
});

test("Mandat schuetzt vor fremden Buchungen gleicher Gegenpartei und gleichen Betrags", () => {
  const transaktionen = [
    tx("KTO-001", "2026-05-01", "-30.00", { mandatsreferenz: "MANDAT-A" }),
    tx("KTO-001", "2026-05-01", "-30.00", { mandatsreferenz: "MANDAT-B" }),
    tx("KTO-001", "2026-06-01", "-30.00", { mandatsreferenz: "MANDAT-A" }),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-30.00", "2026-06-01")]);
  assert.deepEqual(out.zuordnungen.map((z) => z.transaktion_id), [transaktionen[0].transaktion_id, transaktionen[2].transaktion_id]);
  assert.equal(transaktionen[1].regelzahlung_id, undefined);
});

test("ohne Mandat: Gegenpartei mit enger Toleranz und gleicher Kategorie", () => {
  const g = { gegenpartei: "Musterwerk GmbH", kategorie_id: "KAT-002" };
  const transaktionen = [
    tx("KTO-001", "2026-03-02", "-100.00", g),
    tx("KTO-001", "2026-04-01", "-109.00", g),
    tx("KTO-001", "2026-05-04", "-120.00", g),
    tx("KTO-001", "2026-06-01", "-101.00", { ...g, kategorie_id: "KAT-003" }),
    tx("KTO-001", "2026-07-01", "-100.00", { ...g, gegenpartei: "Anderes Werk" }),
    tx("KTO-001", "2026-08-03", "-100.00", g),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-002", "-100.00", "2026-08-01", { kategorie_id: "KAT-002" })]);
  assert.deepEqual(zugeordnet(out, "RZ-002"), ["2026-03-02", "2026-04-01", "2026-08-03"]);
  assert.ok(out.zuordnungen.every((z) => z.signal === "gegenpartei"));
});

test("geschaetzter Betrag: Anker in der Toleranz, wenn eindeutig", () => {
  const g = { gegenpartei: "Arbeitgeber Muster", kategorie_id: "KAT-001" };
  const transaktionen = [
    tx("KTO-002", "2026-05-28", "2010.40", g),
    tx("KTO-002", "2026-06-26", "2088.10", g),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-003", "2050.00", "2026-06-28", { konto_id: "KTO-002", kategorie_id: "KAT-001", qualitaet: "geschaetzt" })]);
  assert.equal(out.je_regelzahlung[0].anker_exakt, false);
  assert.deepEqual(zugeordnet(out, "RZ-003"), ["2026-05-28", "2026-06-26"]);
});

test("belegter Betrag: kein Anker in der Toleranz", () => {
  const transaktionen = [tx("KTO-001", "2026-06-01", "-95.00", { mandatsreferenz: "MANDAT-FREMD" })];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-004", "-100.00", "2026-06-01", { qualitaet: "belegt" })]);
  assert.equal(out.zuordnungen.length, 0);
  assert.equal(out.uebersprungen[0].grund, "ohne-anker");
});

test("cent-genauer Anker am Vormonat schlaegt Toleranzkandidaten am Ankertermin", () => {
  const transaktionen = [
    tx("KTO-001", "2026-06-01", "-80.00", { mandatsreferenz: "MANDAT-A" }),
    tx("KTO-001", "2026-06-01", "-77.00", { mandatsreferenz: "MANDAT-B" }),
    tx("KTO-001", "2026-07-01", "-60.00", { mandatsreferenz: "MANDAT-A" }),
    tx("KTO-001", "2026-07-01", "-77.00", { mandatsreferenz: "MANDAT-B" }),
    tx("KTO-001", "2026-07-01", "-83.00", { mandatsreferenz: "MANDAT-C" }),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-005", "-80.00", "2026-07-01", { qualitaet: "geschaetzt" })]);
  assert.equal(out.je_regelzahlung[0].anker, transaktionen[0].transaktion_id);
  assert.deepEqual(out.zuordnungen.map((z) => z.betrag), ["-80.00", "-60.00"]);
});

test("gleiches Mandat, gleicher Betrag: der Tag entscheidet", () => {
  const m = { mandatsreferenz: "MANDAT-SIM", gegenpartei: "Mobilfunk Muster", kategorie_id: "KAT-013" };
  const transaktionen = [];
  for (const monat of ["04", "05", "06"]) {
    transaktionen.push(tx("KTO-001", `2026-${monat}-10`, "-5.99", m), tx("KTO-001", `2026-${monat}-11`, "-5.99", m), tx("KTO-001", `2026-${monat}-15`, "-5.99", m));
  }
  const out = matchRegelzahlungen(transaktionen, [
    rz("RZ-010", "-5.99", "2026-06-10", { kategorie_id: "KAT-013" }),
    rz("RZ-011", "-5.99", "2026-06-11", { kategorie_id: "KAT-013" }),
    rz("RZ-012", "-5.99", "2026-06-15", { kategorie_id: "KAT-013" }),
  ]);
  assert.deepEqual(zugeordnet(out, "RZ-010"), ["2026-04-10", "2026-05-10", "2026-06-10"]);
  assert.deepEqual(zugeordnet(out, "RZ-011"), ["2026-04-11", "2026-05-11", "2026-06-11"]);
  assert.deepEqual(zugeordnet(out, "RZ-012"), ["2026-04-15", "2026-05-15", "2026-06-15"]);
  assert.equal(out.mehrdeutig.length, 0);
});

test("ein Mandat fuer zwei Vertraege: der Betrag entscheidet", () => {
  const m = { mandatsreferenz: "MANDAT-GEMEINSAM" };
  const transaktionen = [
    tx("KTO-001", "2025-12-01", "-60.00", m),
    tx("KTO-001", "2025-12-01", "-90.00", m),
    tx("KTO-001", "2026-01-02", "-60.00", m),
  ];
  const out = matchRegelzahlungen(transaktionen, [
    rz("RZ-020", "-60.00", "2026-01-01"),
    rz("RZ-021", "-90.00", "2025-12-01", { rhythmus_einheit: "jahr" }),
  ]);
  assert.deepEqual(zugeordnet(out, "RZ-020"), ["2025-12-01", "2026-01-02"]);
  assert.equal(out.zuordnungen.find((z) => z.regelzahlung_id === "RZ-020" && z.buchungsdatum === "2025-12-01").betrag, "-60.00");
  assert.deepEqual(out.zuordnungen.filter((z) => z.regelzahlung_id === "RZ-021").map((z) => z.betrag), ["-90.00"]);
});

test("je Termin hoechstens eine Buchung, die naechstliegende im Betrag", () => {
  const m = { mandatsreferenz: "MANDAT-A" };
  const transaktionen = [
    tx("KTO-001", "2026-06-01", "-50.00", m),
    tx("KTO-001", "2026-06-03", "-12.00", m),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-50.00", "2026-06-01")]);
  assert.equal(out.zuordnungen.length, 1);
  assert.equal(transaktionen[1].regelzahlung_id, undefined);
});

test("ausserhalb des Fensters keine Zuordnung", () => {
  const m = { mandatsreferenz: "MANDAT-A" };
  const transaktionen = [tx("KTO-001", "2026-05-12", "-50.00", m), tx("KTO-001", "2026-06-01", "-50.00", m)];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-50.00", "2026-06-01")]);
  assert.deepEqual(zugeordnet(out, "RZ-001"), ["2026-06-01"]);
});

test("Konsumplan ohne Konto, unbestaetigte Regelzahlung und fehlender Anker werden nicht zugeordnet", () => {
  const transaktionen = [tx("KTO-001", "2026-06-01", "-80.00", { mandatsreferenz: "MANDAT-A" })];
  const out = matchRegelzahlungen(transaktionen, [
    rz("RZ-030", "-80.00", "2026-06-01", { konto_id: undefined }),
    rz("RZ-031", "-80.00", "2026-06-01", { status: "vorgeschlagen" }),
    rz("RZ-032", "-300.00", "2026-06-01"),
  ]);
  assert.equal(out.zuordnungen.length, 0);
  assert.deepEqual(out.uebersprungen.map((u) => [u.regelzahlung_id, u.grund]), [["RZ-030", "ohne-konto"], ["RZ-032", "ohne-anker"]]);
});

test("Anker mit zwei verschiedenen Kennungen ist mehrdeutig", () => {
  const transaktionen = [
    tx("KTO-001", "2026-06-01", "-80.00", { mandatsreferenz: "MANDAT-A" }),
    tx("KTO-001", "2026-06-01", "-80.00", { mandatsreferenz: "MANDAT-B" }),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-80.00", "2026-06-01")]);
  assert.equal(out.zuordnungen.length, 0);
  assert.equal(out.uebersprungen[0].grund, "anker-mehrdeutig");
});

test("vorhandene regelzahlung_id bleibt, der Termin gilt als erfuellt", () => {
  const m = { mandatsreferenz: "MANDAT-A" };
  const transaktionen = [
    tx("KTO-001", "2026-05-01", "-50.00", { ...m, regelzahlung_id: "RZ-099" }),
    tx("KTO-001", "2026-06-01", "-50.00", { ...m, regelzahlung_id: "RZ-001" }),
    tx("KTO-001", "2026-06-02", "-50.00", m),
    tx("KTO-001", "2026-07-01", "-50.00", m),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "-50.00", "2026-06-01")]);
  assert.equal(transaktionen[0].regelzahlung_id, "RZ-099");
  assert.deepEqual(zugeordnet(out, "RZ-001"), ["2026-07-01"]);
  assert.equal(transaktionen[2].regelzahlung_id, undefined);
  assert.equal(out.je_regelzahlung[0].bereits, 1);
});

test("Vertragsnachfolge: die neue Regelzahlung reicht nicht vor das Ende der alten", () => {
  const m = { mandatsreferenz: "MANDAT-A", kategorie_id: "KAT-005" };
  const transaktionen = [
    tx("KTO-001", "2025-01-02", "-92.00", m),
    tx("KTO-001", "2026-01-02", "-92.00", m),
    tx("KTO-001", "2027-01-04", "-88.00", m),
  ];
  const jahr = { rhythmus_einheit: "jahr", kategorie_id: "KAT-005" };
  const out = matchRegelzahlungen(transaktionen, [
    rz("RZ-040", "-92.00", "2025-01-01", { ...jahr, aktiv_bis: "2026-12-31" }),
    rz("RZ-041", "-88.00", "2027-01-01", jahr),
  ]);
  assert.deepEqual(zugeordnet(out, "RZ-040"), ["2025-01-02", "2026-01-02"]);
  assert.deepEqual(zugeordnet(out, "RZ-041"), ["2027-01-04"]);
});

test("Eingaenge nur gegen Eingaenge", () => {
  const g = { gegenpartei: "Familienkasse Muster", kategorie_id: "KAT-008" };
  const transaktionen = [tx("KTO-002", "2026-06-20", "300.00", g), tx("KTO-002", "2026-07-20", "-300.00", g), tx("KTO-002", "2026-07-21", "300.00", g)];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-050", "300.00", "2026-07-20", { konto_id: "KTO-002", kategorie_id: "KAT-008" })]);
  assert.deepEqual(zugeordnet(out, "RZ-050"), ["2026-06-20", "2026-07-21"]);
});

test("CLI: Vorschau schreibt nichts, --schreiben setzt regelzahlung_id und validiert", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rz-matcher-"));
  try {
    await cp(path.join(repo, "app/data/demo"), root, { recursive: true });
    const datei = path.join(root, "transaktionen.jsonl");
    const vorher = await readFile(datei, "utf8");

    const vorschau = await run(process.execPath, [cli, root]);
    const v = JSON.parse(vorschau.stdout.slice(0, vorschau.stdout.lastIndexOf("}") + 1));
    assert.equal(v.modus, "vorschau");
    assert.ok(v.neue_zuordnungen > 0, "Demodaten liefern Zuordnungen");
    assert.equal(await readFile(datei, "utf8"), vorher);

    const lauf = await run(process.execPath, [cli, root, "--schreiben"]);
    assert.equal(lauf.stderr, "");
    const zeilen = (await readFile(datei, "utf8")).trim().split("\n").map((z) => JSON.parse(z));
    assert.equal(zeilen.filter((t) => t.regelzahlung_id).length, v.neue_zuordnungen);

    const zweiter = await run(process.execPath, [cli, root]);
    assert.match(zweiter.stdout, /"neue_zuordnungen": 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI: ungueltiger Stand nach dem Schreiben setzt Exitcode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rz-matcher-"));
  try {
    await cp(path.join(repo, "app/data/demo"), root, { recursive: true });
    const rzDatei = path.join(root, "regelzahlungen.json");
    const rzs = JSON.parse(await readFile(rzDatei, "utf8"));
    rzs[0].kategorie_id = "KAT-999";
    await writeFile(rzDatei, JSON.stringify(rzs));
    await assert.rejects(run(process.execPath, [cli, root, "--schreiben"]), (e) => e.code === 1 && /Validierung/.test(e.stderr));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Gekuerzte Gegenpartei aus einem anderen Auszugsformat zaehlt mit", () => {
  const voll = { gegenpartei: "Arbeitgeberverband fuer das Beispielland e.V.", kategorie_id: "KAT-001" };
  const gekuerzt = { gegenpartei: "Arbeitgeberverband fuer das Beispi", kategorie_id: "KAT-001" };
  const transaktionen = [
    tx("KTO-001", "2026-06-26", "8000.00", voll),
    tx("KTO-001", "2026-07-27", "8100.00", voll),
    tx("KTO-001", "2026-08-26", "8050.00", gekuerzt),
    tx("KTO-001", "2026-09-28", "8050.00", gekuerzt),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-001", "8000.00", "2026-06-26", { kategorie_id: "KAT-001", qualitaet: "geschaetzt" })]);
  assert.deepEqual(zugeordnet(out, "RZ-001"), ["2026-06-26", "2026-07-27", "2026-08-26", "2026-09-28"]);
  assert.equal(gleicheGegenpartei("beispiel kg", "beispiel kommanditges"), true, "markantes Wort statt Kuerzung");
  assert.equal(gleicheGegenpartei("abc gmbh", "abc"), false, "zu kurz fuer Kuerzung und markantes Wort");
});

test("Markante Woerter: ohne Zahlungsdienstleister, Fuellwoerter, kurze Woerter und Nummern", () => {
  assert.deepEqual([...markanteWoerter("PAYPAL..MUSIKDIENST.P3D119")], ["musikdienst"]);
  // Der Ort hinter dem Schraegstrich einer Kartenzahlung zaehlt nicht.
  assert.deepEqual([...markanteWoerter("TEXTWERK..DENKFABRIK.SUBSCR/MUSTERSTADT")], ["textwerk", "denkfabrik"]);
  assert.equal(gleicheGegenpartei("TEXTWERK..DENKFABRIK.SUBSCR/MUSTERSTADT", "SOFTWARELADEN24/MUSTERSTADT"), false);
  assert.deepEqual([...markanteWoerter("Streamfix Abo Subscription GmbH www.streamfix.de")], ["streamfix"]);
  assert.deepEqual([...markanteWoerter("Stadtwerke Musterstadt")], ["musterstadt"]);
  assert.deepEqual([...markanteWoerter("")], []);
  assert.deepEqual([...markanteWoerter(undefined)], []);
});

test("Kartenzahlung mit wechselnder Schreibweise der Gegenpartei", () => {
  // Varianten wie im Bankexport: Zahlungsdienstleister davor, Bestellnummer
  // dahinter, Produkt- und Firmenname mal so, mal so.
  const gleich = [
    ["paypal..musikdienst.p3d119", "paypal..musikdienst.p46397b/35314369001"],
    ["paypal..musikdienst.p3d119", "musikdienst"],
    ["textwerk.ai.subscription", "denkfabrik textwerk subsc"],
    ["denkfabrik..textwerk.sub/", "textwerk.ai.subscription"],
    ["streamfix..plusplan.subscr", "streamfix - plus plan"],
  ];
  for (const [a, b] of gleich) {
    assert.equal(gleicheGegenpartei(a, b), true, `${a} ~ ${b}`);
    assert.equal(gleicheGegenpartei(b, a), true, `${b} ~ ${a}`);
  }
});

test("Verschiedene Empfaenger mit nur gemeinsamen Fuellwoertern gelten nicht als gleich", () => {
  const verschieden = [
    ["stadtwerke musterstadt", "stadtwerke beispielstadt"],
    ["musterversicherung ag", "beispiel versicherung ag"],
    ["paypal..musikdienst.p3d119", "paypal..streamfix.p46397b"],
    ["sparkasse musterstadt kartenzahlung", "volksbank beispielstadt kartenzahlung"],
    ["online shop gmbh", "online store gmbh"],
    ["abo 12345", "abo 12345 6789"],
  ];
  for (const [a, b] of verschieden) assert.equal(gleicheGegenpartei(a, b), false, `${a} != ${b}`);
  assert.equal(gleicheGegenpartei("", "musikdienst"), false);
  assert.equal(gleicheGegenpartei("musikdienst", ""), false);
  assert.equal(gleicheGegenpartei("", ""), false);
  assert.equal(gleicheGegenpartei(undefined, "musikdienst"), false);
});

test("Matcher ordnet Kartenzahlungen mit wechselnder Gegenpartei zu, sonst nicht", () => {
  const k = { kategorie_id: "KAT-007" };
  const transaktionen = [
    tx("KTO-001", "2026-05-10", "-10.99", { ...k, gegenpartei: "PAYPAL..MUSIKDIENST.P3D119" }),
    tx("KTO-001", "2026-06-10", "-10.99", { ...k, gegenpartei: "PAYPAL..MUSIKDIENST.P46397B/35314369001" }),
    tx("KTO-001", "2026-07-11", "-11.49", { ...k, gegenpartei: "Musikdienst" }),
    // fremder Dienst gleichen Betrags ueber denselben Zahlungsdienstleister
    tx("KTO-001", "2026-08-10", "-10.99", { ...k, gegenpartei: "PAYPAL..STREAMFIX.P9X1" }),
    // gleicher Dienst, andere Kategorie
    tx("KTO-001", "2026-09-10", "-10.99", { kategorie_id: "KAT-003", gegenpartei: "Musikdienst" }),
    // gleicher Dienst, Betrag ausserhalb der Toleranz
    tx("KTO-001", "2026-10-10", "-14.99", { ...k, gegenpartei: "Musikdienst" }),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-005", "-10.99", "2026-06-10", k)]);
  assert.deepEqual(zugeordnet(out, "RZ-005"), ["2026-05-10", "2026-06-10", "2026-07-11"]);
  assert.ok(out.zuordnungen.every((z) => z.signal === "gegenpartei"));
});

test("Stadtwerke verschiedener Orte werden nicht vermischt", () => {
  const k = { kategorie_id: "KAT-002" };
  const transaktionen = [
    tx("KTO-001", "2026-05-02", "-80.00", { ...k, gegenpartei: "Stadtwerke Musterstadt" }),
    tx("KTO-001", "2026-06-01", "-80.00", { ...k, gegenpartei: "Stadtwerke Beispielstadt" }),
    tx("KTO-001", "2026-07-01", "-80.00", { ...k, gegenpartei: "Stadtwerke Musterstadt GmbH" }),
  ];
  const out = matchRegelzahlungen(transaktionen, [rz("RZ-006", "-80.00", "2026-07-01", k)]);
  assert.deepEqual(zugeordnet(out, "RZ-006"), ["2026-05-02", "2026-07-01"]);
});
