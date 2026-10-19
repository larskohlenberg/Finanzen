// Geprueftes Release-Deploy (Review 1.0): ops/aktualisieren.sh laeuft gegen
// einen Wegwerf-Checkout mit echtem Git und echter Schreibsperre. Attrappen im
// PATH ersetzen id (root), sudo (fuehrt einfach aus), systemctl, journalctl,
// curl und sleep. Der Validator des Wegwerf-Repos liest seine Fehler aus
// app/fehler.txt des jeweiligen Commits; der Sperr-/Rauchtest-Helfer ist der
// echte (app/tools/deploy-pruefung.mjs) auf einer Kopie der Demodaten.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skript = fileURLToPath(new URL("../ops/aktualisieren.sh", import.meta.url));
const echterHelfer = fileURLToPath(new URL("../app/tools/deploy-pruefung.mjs", import.meta.url));
const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const ohneBash = process.platform === "win32";

const ATTRAPPEN = {
  id: '#!/bin/sh\necho 0\n',
  // sudo -u <nutzer> -H cmd ... -> cmd ...
  sudo: '#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -u) shift 2;; -H) shift;; *) break;; esac; done\nexec "$@"\n',
  systemctl: '#!/bin/sh\necho "$*" >> "$W/systemctl.log"\nexit 0\n',
  journalctl: '#!/bin/sh\necho "(journal)"\n',
  sleep: '#!/bin/sh\nexit 0\n',
  // HTTP kaputt, wenn der laufende Stand (version.json) in $W/kaputt steht.
  curl: '#!/bin/sh\nkurz=$(sed -n \'s/.*"kurz": "\\([0-9a-f]*\\)".*/\\1/p\' "$FINANZEN_VERZ/app/version.json" 2>/dev/null)\nif [ -n "$kurz" ] && grep -q "$kurz" "$W/kaputt" 2>/dev/null; then printf 000; exit 7; fi\nprintf 403\n',
};

const VALIDATOR = `import { existsSync, readFileSync } from "node:fs";
const datei = new URL("../fehler.txt", import.meta.url);
const fehler = existsSync(datei) ? readFileSync(datei, "utf8").split("\\n").filter(Boolean) : [];
if (fehler.length === 0) console.log("Master data validation passed");
else { console.error("Master data validation failed"); for (const f of fehler) console.error("- " + f); process.exitCode = 1; }
`;

const HELFER = `import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
if (process.argv[2] === "rauchtest" && existsSync(new URL("../rauchtest-kaputt", import.meta.url))) {
  console.error("Rauchtest: Absturz (Attrappe)"); process.exit(1);
}
try { process.stdout.write(execFileSync(process.execPath, [${JSON.stringify(echterHelfer)}, ...process.argv.slice(2)])); }
catch (e) { process.exit(e.status ?? 1); }
`;

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function umgebung() {
  const w = realpathSync(mkdtempSync(join(tmpdir(), "finanzen-deploy-")));
  const bin = join(w, "bin");
  mkdirSync(bin);
  for (const [name, inhalt] of Object.entries(ATTRAPPEN)) {
    writeFileSync(join(bin, name), inhalt);
    chmodSync(join(bin, name), 0o755);
  }
  mkdirSync(join(w, "tmp"));
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    W: w,
    TMPDIR: join(w, "tmp"),
    GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.org",
    GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.org",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(w, "gitconfig"),
    FINANZEN_VERZ: join(w, "opt"),
    FINANZEN_ENV_DATEI: join(w, "app.env"),
    FINANZEN_NUTZER: "finanzen",
    FINANZEN_SPERRE_WARTEN: "1",
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL, "[init]\n\tdefaultBranch = main\n");
  writeFileSync(env.FINANZEN_ENV_DATEI, "FINANZEN_HOST=0.0.0.0\nFINANZEN_PORT=8080\nFINANZEN_SPERRE_MINUTEN=5\n");

  const quelle = join(w, "quelle");
  mkdirSync(join(quelle, "app", "tools"), { recursive: true });
  const g = (...a) => spawnSync("git", a, { cwd: quelle, encoding: "utf8", env });
  g("init", "-q");
  writeFileSync(join(quelle, "app", "tools", "validator.mjs"), VALIDATOR);
  writeFileSync(join(quelle, "app", "tools", "deploy-pruefung.mjs"), HELFER);
  writeFileSync(join(quelle, "app", "fehler.txt"), "Altfehler A\n");
  const commit = (nachricht, aendern = () => {}) => {
    aendern(quelle);
    g("add", "-A");
    const r = g("commit", "-q", "-m", nachricht);
    if (r.status !== 0) throw new Error(r.stderr);
    return g("rev-parse", "HEAD").stdout.trim();
  };
  const c1 = commit("eins");
  spawnSync("git", ["clone", "-q", "--bare", quelle, join(w, "origin.git")], { env });
  spawnSync("git", ["clone", "-q", join(w, "origin.git"), env.FINANZEN_VERZ], { env });
  cpSync(demo, join(env.FINANZEN_VERZ, "app", "data", "master"), { recursive: true });
  const veroeffentliche = (nachricht, aendern) => {
    const c = commit(nachricht, aendern);
    const r = g("push", "-q", join(w, "origin.git"), "HEAD:main");
    if (r.status !== 0) throw new Error(r.stderr);
    return c;
  };
  const lauf = (...args) => spawnSync("bash", [skript, ...args], { env, encoding: "utf8" });
  const opt = env.FINANZEN_VERZ;
  return {
    w, opt, c1, veroeffentliche, lauf,
    kopf: () => git(opt, "rev-parse", "HEAD"),
    neustarts: () => (existsSync(join(w, "systemctl.log")) ? readFileSync(join(w, "systemctl.log"), "utf8").split("\n").filter((z) => z.startsWith("restart")).length : 0),
    version: () => JSON.parse(readFileSync(join(opt, "app", "version.json"), "utf8")),
    sperrdatei: join(opt, "app", "data", "master", ".schreibsperre"),
    pruefkopien: () => readdirSync(join(w, "tmp")),
    kaputt: (...commits) => writeFileSync(join(w, "kaputt"), commits.map((c) => c.slice(0, 7)).join("\n")),
    weg: () => rmSync(w, { recursive: true, force: true }),
  };
}

test("Gutfall: geprueft, umgeschaltet, Rauchtests ok, Sperre und Pruefkopie weg", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    const c2 = u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    const r = u.lauf("main");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(u.kopf(), c2);
    assert.equal(u.version().commit, c2);
    assert.equal(u.neustarts(), 1);
    assert.match(r.stdout, /keine neuen Fehler \(bestehende: 1\)/);
    assert.match(r.stdout, /HTTP-Rauchtest ok \(HTTP 403\)/);
    assert.match(r.stdout, /Daten-Rauchtest ok: \d+ Buchungen/);
    assert.match(r.stdout, /Rauchtests ok/);
    assert.equal(existsSync(u.sperrdatei), false);
    assert.deepEqual(u.pruefkopien(), []);
  } finally {
    u.weg();
  }
});

test("neuer Validatorfehler: Abbruch vor dem Umschalten, kein Neustart", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "fehler.txt"), "Altfehler A\nNeufehler B\n"));
    const r = u.lauf("main");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /1 neue\(n\) Validatorfehler; nichts umgeschaltet/);
    assert.match(r.stderr, /- Neufehler B/);
    assert.doesNotMatch(r.stderr, /Altfehler A/);
    assert.equal(u.kopf(), u.c1);
    assert.equal(u.neustarts(), 0);
    assert.equal(existsSync(u.sperrdatei), false);
    assert.deepEqual(u.pruefkopien(), []);
  } finally {
    u.weg();
  }
});

test("behobener Altfehler ist kein Hindernis", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    const c2 = u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "fehler.txt"), ""));
    const r = u.lauf("main");
    assert.equal(r.status, 0, r.stderr);
    assert.equal(u.kopf(), c2);
  } finally {
    u.weg();
  }
});

test("Daten-Rauchtest des neuen Codes scheitert: nichts umgeschaltet", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "rauchtest-kaputt"), ""));
    const r = u.lauf("main");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Daten-Rauchtest mit dem neuen Stand gescheitert; nichts umgeschaltet/);
    assert.equal(u.kopf(), u.c1);
    assert.equal(u.neustarts(), 0);
  } finally {
    u.weg();
  }
});

test("HTTP-Rauchtest scheitert: Ruecksprung auf den alten Commit und Neustart", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    const c2 = u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    u.kaputt(c2);
    const r = u.lauf("main");
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /HTTP-Rauchtest gescheitert/);
    assert.match(r.stderr, /Ruecksprung ok: wieder auf .* Das Update ist NICHT eingespielt/);
    assert.equal(u.kopf(), u.c1);
    assert.equal(u.version().commit, u.c1);
    assert.equal(git(u.opt, "rev-parse", "--abbrev-ref", "HEAD"), "main");
    assert.equal(u.neustarts(), 2);
    assert.equal(existsSync(u.sperrdatei), false);
    // Spaeterer, reparierter Stand spult wieder vor.
    const c3 = u.veroeffentliche("drei", (q) => writeFileSync(join(q, "app", "neu.txt"), "y"));
    const r2 = u.lauf("main");
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(u.kopf(), c3);
  } finally {
    u.weg();
  }
});

test("Ruecksprung scheitert ebenfalls: Exitcode 2 mit klarer Meldung", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    const c2 = u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    u.kaputt(c2, u.c1);
    const r = u.lauf("main");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /RUECKSPRUNG GESCHEITERT/);
    assert.equal(u.kopf(), u.c1);
  } finally {
    u.weg();
  }
});

test("Schreibsperre belegt: Abbruch ohne Umschalten, fremde Sperre bleibt", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    const fremd = JSON.stringify({ pid: process.pid, rechner: hostname(), zeit: new Date().toISOString(), wer: "mcp", kennung: "fremd" });
    writeFileSync(u.sperrdatei, `${fremd}\n`);
    const r = u.lauf("main");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ist gesperrt/);
    assert.match(r.stderr, /Schreibsperre nicht erhalten; nichts umgeschaltet/);
    assert.equal(u.kopf(), u.c1);
    assert.equal(u.neustarts(), 0);
    assert.equal(JSON.parse(readFileSync(u.sperrdatei, "utf8")).kennung, "fremd");
  } finally {
    u.weg();
  }
});

test("Sperre gilt waehrend des Wechsels fuer das Skript und wird danach frei", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    // systemctl-Attrappe haelt beim Neustart fest, wer die Sperre hat.
    writeFileSync(join(u.w, "bin", "systemctl"), `#!/bin/sh\necho "$*" >> "$W/systemctl.log"\n[ "$1" = restart ] && cat "${u.sperrdatei}" > "$W/sperre-beim-neustart"\nexit 0\n`);
    u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    const r = u.lauf("main");
    assert.equal(r.status, 0, r.stderr);
    const halter = JSON.parse(readFileSync(join(u.w, "sperre-beim-neustart"), "utf8"));
    assert.equal(halter.wer, "deploy");
    assert.notEqual(halter.pid, process.pid);
    assert.equal(existsSync(u.sperrdatei), false);
  } finally {
    u.weg();
  }
});

test("lokaler Branch nicht vorspulbar oder lokale Aenderung: Abbruch vor allem anderen", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    u.veroeffentliche("zwei", (q) => writeFileSync(join(q, "app", "neu.txt"), "x"));
    writeFileSync(join(u.opt, "app", "fehler.txt"), "lokal geaendert\n");
    let r = u.lauf("main");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /lokale Aenderungen/);
    git(u.opt, "commit", "-q", "-am", "lokal");
    r = u.lauf("main");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nicht per Fast-Forward/);
    assert.equal(u.neustarts(), 0);
    assert.deepEqual(u.pruefkopien(), []);
  } finally {
    u.weg();
  }
});

test("ungueltiger Branch-Name und fehlender Branch", { skip: ohneBash }, () => {
  const u = umgebung();
  try {
    let r = u.lauf("x;y");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Ungueltiger Branch-Name/);
    r = u.lauf("gibtsnicht");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /origin\/gibtsnicht gibt es nicht/);
    assert.equal(u.kopf(), u.c1);
  } finally {
    u.weg();
  }
});

test("deploy-pruefung: Sperre mit fremder PID, nur eigene Kennung gibt frei, tote PID verwaist", () => {
  const w = realpathSync(mkdtempSync(join(tmpdir(), "finanzen-deploy-sperre-")));
  const root = join(w, "bestand");
  cpSync(demo, root, { recursive: true });
  const helfer = (...a) => spawnSync(process.execPath, [echterHelfer, ...a], { encoding: "utf8" });
  try {
    const r = helfer("sperre", root, `--pid=${process.pid}`, "--warten=1");
    assert.equal(r.status, 0, r.stderr);
    const kennung = r.stdout.trim();
    const halter = JSON.parse(readFileSync(join(root, ".schreibsperre"), "utf8"));
    assert.equal(halter.pid, process.pid);
    assert.equal(halter.kennung, kennung);
    // Helfer ist beendet, die Sperre gilt weiter (PID lebt).
    assert.equal(helfer("sperre", root, `--pid=${process.pid}`, "--warten=1").status, 3);
    helfer("freigeben", root, "falsch");
    assert.equal(existsSync(join(root, ".schreibsperre")), true);
    helfer("freigeben", root, kennung);
    assert.equal(existsSync(join(root, ".schreibsperre")), false);
    // Tote PID (beendeter Kindprozess): Sperre wird uebernommen.
    const tot = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim();
    assert.equal(helfer("sperre", root, `--pid=${tot}`, "--warten=1").status, 0);
    assert.equal(helfer("sperre", root, `--pid=${process.pid}`, "--warten=1").status, 0);
    assert.equal(helfer("rauchtest", root).status, 0);
    assert.equal(helfer("sperre", root, "--pid=abc").status, 1);
  } finally {
    rmSync(w, { recursive: true, force: true });
  }
});
