// app/mcp/inhalte.mjs
// Prompts (= Skills aus app/docs/skills/) und Resources (Betriebs- und
// Fachdoku). Alles wird bei jedem Aufruf frisch von der Platte gelesen.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function beschreibungAus(text) {
  const bloecke = text.replace(/^---[\s\S]*?\n---\n/, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const absatz = bloecke.find((b) => !b.startsWith("#"));
  const titel = bloecke.find((b) => b.startsWith("#"))?.replace(/^#+\s*/, "");
  return (absatz ?? titel ?? "").replace(/\s+/g, " ").slice(0, 300);
}

function frontmatterBeschreibung(text) {
  return text.match(/^---[\s\S]*?\ndescription:\s*(.+)\n[\s\S]*?---/)?.[1]?.trim();
}

async function promptQuellen(ctx) {
  const ordner = path.join(ctx.app, "docs", "skills");
  const namen = (await readdir(ordner).catch(() => [])).filter((n) => n.endsWith(".md")).sort();
  const quellen = namen.map((n) => ({ name: n.slice(0, -3), datei: path.join(ordner, n) }));
  quellen.push({ name: "import-durchlauf-claude", datei: path.join(ctx.repo, ".claude", "skills", "import-durchlauf", "SKILL.md") });
  return quellen;
}

export async function listePrompts(ctx) {
  const prompts = [];
  for (const q of await promptQuellen(ctx)) {
    const text = await readFile(q.datei, "utf8").catch(() => null);
    if (text === null) continue;
    prompts.push({ name: q.name, description: frontmatterBeschreibung(text) ?? beschreibungAus(text) });
  }
  return prompts;
}

export async function holePrompt(ctx, name) {
  const q = (await promptQuellen(ctx)).find((p) => p.name === name);
  const text = q && await readFile(q.datei, "utf8").catch(() => null);
  if (!text) return null;
  return {
    description: frontmatterBeschreibung(text) ?? beschreibungAus(text),
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}

async function ressourcen(ctx) {
  const liste = [
    { uri: "finanzen://docs/agent-context", name: "agent-context", datei: path.join(ctx.app, "docs", "agent-context.md"), description: "Operative Wahrheit: Status, Herkunft, Kategorisierung, Validierung, Tools, Betrieb ueber MCP." },
    { uri: "finanzen://docs/context", name: "CONTEXT", datei: path.join(ctx.repo, "CONTEXT.md"), description: "Fachliches Glossar." },
  ];
  const adrOrdner = path.join(ctx.repo, "docs", "adr");
  for (const n of (await readdir(adrOrdner).catch(() => [])).filter((x) => x.endsWith(".md")).sort()) {
    liste.push({ uri: `finanzen://docs/adr/${n}`, name: `adr/${n}`, datei: path.join(adrOrdner, n), description: "Architekturentscheidung" });
  }
  return liste;
}

export async function listeRessourcen(ctx) {
  return (await ressourcen(ctx)).map(({ uri, name, description }) => ({ uri, name, description, mimeType: "text/markdown" }));
}

export async function leseRessource(ctx, uri) {
  const r = (await ressourcen(ctx)).find((x) => x.uri === uri);
  const text = r && await readFile(r.datei, "utf8").catch(() => null);
  if (text === null || text === undefined) return null;
  return { contents: [{ uri, mimeType: "text/markdown", text }] };
}
