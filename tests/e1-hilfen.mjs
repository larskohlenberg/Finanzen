// tests/e1-hilfen.mjs
// Gemeinsame Helfer der E1-Prototyp-Tests: Demodaten in einen Temp-Ordner,
// Arbeiterprozesse starten und hart beenden.
import { spawn } from "node:child_process";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEMO = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
export const ARBEITER = fileURLToPath(new URL("../prototyp/e1/arbeiter.mjs", import.meta.url));

export async function tempOrdner(name = "e1-") {
  return mkdtemp(path.join(tmpdir(), name));
}

export async function demoKopie() {
  const ziel = path.join(await tempOrdner(), "demo");
  await cp(DEMO, ziel, { recursive: true });
  return ziel;
}

// Startet den Arbeiter; liefert { kind, fertig } mit fertig -> { code, signal, out, err }.
export function starte(args, env = {}) {
  const kind = spawn(process.execPath, [ARBEITER, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  kind.stdout.on("data", (d) => { out += d; });
  kind.stderr.on("data", (d) => { err += d; });
  const fertig = new Promise((resolve) => kind.on("exit", (code, signal) => resolve({ code, signal, out, err })));
  return { kind, fertig };
}

export const lauf = (args, env) => starte(args, env).fertig;

export const warte = (ms) => new Promise((r) => setTimeout(r, ms));
