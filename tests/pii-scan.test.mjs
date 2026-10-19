import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  formatiere,
  hinzugefuegteZeilen,
  ibanGueltig,
  luhnGueltig,
  scanText,
  scanZeilen,
  sperrlisteAus,
} from "../app/tools/pii-scan.mjs";

// Pruefwerte entstehen erst zur Laufzeit, damit der Scan dieses Repos die
// Testdatei selbst nicht als Fundstelle meldet.
function ibanDE(blz, konto) {
  const bban = blz + konto;
  let rest = 0;
  for (const ziffer of `${bban}131400`) rest = (rest * 10 + Number(ziffer)) % 97;
  return `DE${String(98 - rest).padStart(2, "0")}${bban}`;
}

function mitLuhn(ohnePruefziffer) {
  for (let d = 0; d <= 9; d++) {
    if (luhnGueltig(ohnePruefziffer + d)) return ohnePruefziffer + d;
  }
}

const zeile = (text, datei = "tests/beispiel.test.mjs") => [{ datei, zeile: 1, text }];
const regeln = (treffer) => treffer.map((t) => `${t.art}:${t.regel}`);

test("hinzugefuegteZeilen: Datei und Zeilennummer aus einem Diff mit -U0, geloeschte Dateien ohne Zeilen", () => {
  const diff = [
    "diff --git a/docs/x.md b/docs/x.md",
    "--- a/docs/x.md",
    "+++ b/docs/x.md",
    "@@ -3,0 +4,2 @@",
    "+erste",
    "+zweite",
    "@@ -10 +12 @@",
    "-alt",
    "+neu",
    "diff --git a/weg.txt b/weg.txt",
    "--- a/weg.txt",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-x",
  ].join("\n");
  assert.deepEqual(hinzugefuegteZeilen(diff), [
    { datei: "docs/x.md", zeile: 4, text: "erste" },
    { datei: "docs/x.md", zeile: 5, text: "zweite" },
    { datei: "docs/x.md", zeile: 12, text: "neu" },
  ]);
});

test("IBAN mit gueltiger Pruefziffer und vergebener Bankleitzahl ist ein Fehler, auch in Vierergruppen", () => {
  const iban = ibanDE("12345678", "0000004711");
  assert.ok(ibanGueltig(iban));
  assert.deepEqual(regeln(scanZeilen(zeile(`iban: "${iban}"`))), ["fehler:iban"]);
  const gruppiert = iban.match(/.{1,4}/g).join(" ");
  assert.deepEqual(regeln(scanZeilen(zeile(`IBAN ${gruppiert} EUR`))), ["fehler:iban"]);
});

test("IBAN-Treffer zeigen den Wert nur maskiert", () => {
  const iban = ibanDE("12345678", "0000004711");
  const ausgabe = formatiere(scanZeilen(zeile(iban)), { github: true }).join("\n");
  assert.doesNotMatch(ausgabe, new RegExp(iban));
  assert.match(ausgabe, new RegExp(`${iban.slice(0, 4)}…${iban.slice(-4)}`));
});

test("erkennbar erfundene IBANs sind nur Warnungen, die Beispiel-IBAN gar nichts", () => {
  const blzNull = ibanDE("00000000", "0000011111");
  assert.deepEqual(regeln(scanZeilen(zeile(blzNull))), ["warnung:iban-erfunden"]);
  const falschePruefziffer = `DE00${ibanDE("12345678", "0000004711").slice(4)}`;
  assert.deepEqual(regeln(scanZeilen(zeile(falschePruefziffer))), ["warnung:iban-erfunden"]);
  assert.deepEqual(scanZeilen(zeile("DE89 3704 0044 0532 0130 00")), []);
});

test("Kartennummer mit gueltiger Luhn-Ziffer ist ein Fehler, Testkarten und Dezimalzahlen nicht", () => {
  const karte = mitLuhn("400012341234123");
  assert.deepEqual(regeln(scanZeilen(zeile(`karte ${karte}`))), ["fehler:kartennummer"]);
  const gruppiert = karte.match(/.{4}/g).join(" ");
  assert.deepEqual(regeln(scanZeilen(zeile(gruppiert))), ["fehler:kartennummer"]);
  const falsch = karte.slice(0, -1) + ((Number(karte.at(-1)) + 1) % 10);
  assert.deepEqual(scanZeilen(zeile(falsch)), []);
  assert.deepEqual(scanZeilen(zeile("4111 1111 1111 1111")), []);
  assert.deepEqual(scanZeilen(zeile(`0.${karte}`)), []);
});

test("Sperrliste: ganzes Wort ohne Gross-/Kleinschreibung, Ausgabe nennt nur die Nummer", () => {
  const sperrliste = sperrlisteAus("# Kommentar\nMusterbank\n\n  Beispielhausen  \n");
  assert.equal(sperrliste.length, 2);
  const treffer = scanZeilen(zeile("Ueberweisung an die musterbank"), { sperrliste });
  assert.deepEqual(regeln(treffer), ["fehler:sperrliste"]);
  assert.match(treffer[0].hinweis, /Eintrag Nr\. 1/);
  assert.doesNotMatch(formatiere(treffer).join("\n"), /musterbank/i);
  assert.deepEqual(scanZeilen(zeile("Musterbanking-App"), { sperrliste }), []);
});

test("Betraege mit Waehrung warnen nur in Prosa, synthetische Betraege im Code nicht", () => {
  assert.deepEqual(regeln(scanZeilen(zeile("Die Rate betraegt 1.234,56 €.", "docs/notiz.md"))), ["warnung:betrag"]);
  assert.deepEqual(scanZeilen(zeile('betrag: "-1234.56", text: "1.234,56 €"')), []);
});

test("Anrede, Adresse und E-Mail warnen ueberall, Beispieldomains nicht", () => {
  const anrede = "Frau";
  assert.deepEqual(regeln(scanZeilen(zeile(`${anrede} Beispiel`))), ["warnung:anrede-name"]);
  const strasse = "Beispielweg";
  assert.deepEqual(regeln(scanZeilen(zeile(`${strasse} 12a`))), ["warnung:adresse"]);
  const at = "@";
  assert.deepEqual(regeln(scanZeilen(zeile(`jemand${at}anbieter.de`))), ["warnung:e-mail"]);
  assert.deepEqual(scanZeilen(zeile(`jemand${at}example.org`)), []);
});

test("scanText prueft Commit- und PR-Texte als Prosa, Annotationen ohne Dateibezug", () => {
  const treffer = scanText("Commit abc1234", "fix: Titel\n\nRate von 99,00 EUR korrigiert");
  assert.deepEqual(treffer.map((t) => [t.datei, t.zeile, t.regel]), [["Commit abc1234", 3, "betrag"]]);
  assert.deepEqual(formatiere(treffer, { github: true }), [
    "::warning title=PII-Scan betrag::Commit abc1234, Zeile 3: Betrag mit Waehrung in Prosa. Konkrete Werte gehoeren ins agent_log.jsonl im Datenbestand.",
  ]);
});

test("CLI: Exit 1 bei hartem Treffer im Diff seit der Basis, Exit 0 ohne", async () => {
  const skript = fileURLToPath(new URL("../app/tools/pii-scan.mjs", import.meta.url));
  const repo = await mkdtemp(join(tmpdir(), "pii-scan-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", ...args], { cwd: repo });
  try {
    git("init", "-q");
    await writeFile(join(repo, "a.txt"), "start\n");
    git("add", ".");
    git("commit", "-q", "-m", "basis");
    await writeFile(join(repo, "a.txt"), "start\nnur Text\n");
    git("commit", "-q", "-am", "harmlos");
    const sauber = spawnSync(process.execPath, [skript, "HEAD~1"], { cwd: repo, encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(sauber.status, 0, sauber.stdout + sauber.stderr);
    assert.match(sauber.stdout, /0 Fehler, 0 Warnungen/);

    await writeFile(join(repo, "b.mjs"), `export const iban = "${ibanDE("12345678", "0000004711")}";\n`);
    git("add", ".");
    git("commit", "-q", "-m", "testdaten");
    const rot = spawnSync(process.execPath, [skript, "HEAD~2"], { cwd: repo, encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(rot.status, 1, rot.stdout + rot.stderr);
    assert.match(rot.stdout, /FEHLER {2}b\.mjs:1 \[iban\]/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
