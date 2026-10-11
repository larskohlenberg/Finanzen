// Gemeinsame Hilfen fuer die MCP-Tests: ein vollstaendig isolierter Repo-Abzug
// in einem Temp-Verzeichnis (Code + Demodaten als data/master) und ein kleiner
// stdio-Client. Der Server bestimmt App-Raum und Repo-Root relativ zu seinem
// Skript — der Abzug beruehrt den Worktree darum nie.
import { spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

export function legeAbzugAn() {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-mcp-test-"));
  for (const teil of ["tools", "mcp", "docs", "schemas"]) {
    cpSync(join(repo, "app", teil), join(wurzel, "app", teil), { recursive: true });
  }
  cpSync(join(repo, "app", "data", "demo"), join(wurzel, "app", "data", "master"), { recursive: true });
  mkdirSync(join(wurzel, "app", "data", "inbox"), { recursive: true });
  mkdirSync(join(wurzel, "app", "Belege"), { recursive: true });
  cpSync(join(repo, ".claude", "skills"), join(wurzel, ".claude", "skills"), { recursive: true });
  mkdirSync(join(wurzel, "docs", "adr"), { recursive: true });
  writeFileSync(join(wurzel, "docs", "adr", "0001-beispiel.md"), "# Beispiel-ADR\n\nText.\n");
  writeFileSync(join(wurzel, "CONTEXT.md"), "# Glossar\n\nBegriffe.\n");
  return {
    wurzel,
    app: join(wurzel, "app"),
    master: join(wurzel, "app", "data", "master"),
    aufraeumen: () => rmSync(wurzel, { recursive: true, force: true }),
  };
}

export function starteServer(abzug, recht = "lesen", datenroot = "data/master") {
  const kind = spawn(process.execPath, [join(abzug.app, "mcp", "server.mjs"), datenroot, `--recht=${recht}`], {
    cwd: abzug.wurzel,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const offen = new Map();
  const zeilen = [];
  let puffer = "";
  let stderr = "";
  let naechsteId = 1;
  kind.stderr.on("data", (d) => { stderr += d; });
  kind.stdout.on("data", (d) => {
    puffer += d;
    let i;
    while ((i = puffer.indexOf("\n")) >= 0) {
      const zeile = puffer.slice(0, i);
      puffer = puffer.slice(i + 1);
      if (!zeile.trim()) continue;
      zeilen.push(zeile);
      const nachricht = JSON.parse(zeile);
      const warter = offen.get(JSON.stringify(nachricht.id ?? null));
      if (warter) { offen.delete(JSON.stringify(nachricht.id ?? null)); warter(nachricht); }
    }
  });

  function roh(text, id) {
    return new Promise((resolve) => {
      offen.set(JSON.stringify(id ?? null), resolve);
      kind.stdin.write(text.endsWith("\n") ? text : `${text}\n`);
    });
  }

  return {
    zeilen,
    stderr: () => stderr,
    roh,
    anfrage(method, params) {
      const id = naechsteId++;
      return roh(JSON.stringify({ jsonrpc: "2.0", id, method, params }), id);
    },
    benachrichtigung(method, params) {
      kind.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    async werkzeug(name, args = {}) {
      const antwort = await this.anfrage("tools/call", { name, arguments: args });
      if (antwort.error) throw new Error(`Protokollfehler: ${antwort.error.message}`);
      return { ...antwort.result, text: antwort.result.content.map((c) => c.text ?? "").join("\n") };
    },
    beenden() {
      kind.stdin.end();
      return new Promise((resolve) => kind.on("close", resolve));
    },
  };
}
