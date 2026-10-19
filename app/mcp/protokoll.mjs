// app/mcp/protokoll.mjs
// JSON-RPC 2.0 / MCP ohne SDK. verarbeiteZeile nimmt eine Zeile von stdin und
// liefert die Antwortzeile (oder null bei Benachrichtigungen).
import { holePrompt, leseRessource, listePrompts, listeRessourcen } from "./inhalte.mjs";
import { OHNE_RELEASE, veraltetHinweis } from "./version.mjs";
import { rufeWerkzeug, sichtbareWerkzeuge } from "./werkzeuge.mjs";
import { pflichtAnleitung } from "./vertrag.mjs";

export const VERSIONEN = ["2025-06-18", "2025-03-26", "2024-11-05"];

class RpcFehler extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Die kurze Pflichtanleitung kommt aus der Vertragsquelle (vertrag.mjs).
const anleitung = pflichtAnleitung;

async function methode(ctx, name, params = {}) {
  switch (name) {
    case "initialize":
      return {
        protocolVersion: VERSIONEN.includes(params.protocolVersion) ? params.protocolVersion : VERSIONEN[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "finanzen", version: ctx.release ?? OHNE_RELEASE },
        instructions: anleitung(ctx),
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: sichtbareWerkzeuge(ctx) };
    case "tools/call": {
      if (typeof params.name !== "string") throw new RpcFehler(-32602, "name fehlt");
      // Nach einem Deploy: alter Code darf neue Daten weder schreiben noch
      // deuten. Nur status bleibt (zeigt beide Release-Staende).
      const veraltet = params.name === "status" ? null : veraltetHinweis(ctx);
      if (veraltet) return { content: [{ type: "text", text: veraltet }], structuredContent: { werkzeug: params.name, ok: false, fehler: "veraltet" }, isError: true };
      const ergebnis = await rufeWerkzeug(ctx, params.name, params.arguments ?? {});
      if (!ergebnis) throw new RpcFehler(-32602, `Unbekanntes Tool: ${params.name}`);
      return ergebnis;
    }
    case "prompts/list":
      return { prompts: await listePrompts(ctx) };
    case "prompts/get": {
      const prompt = await holePrompt(ctx, params.name);
      if (!prompt) throw new RpcFehler(-32602, `Unbekannter Prompt: ${params.name}`);
      return prompt;
    }
    case "resources/list":
      return { resources: await listeRessourcen(ctx) };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "resources/read": {
      const inhalt = await leseRessource(ctx, params.uri);
      if (!inhalt) throw new RpcFehler(-32002, `Resource nicht gefunden: ${params.uri}`);
      return inhalt;
    }
    default:
      throw new RpcFehler(-32601, `Methode nicht gefunden: ${name}`);
  }
}

const gueltigeId = (id) => id === null || typeof id === "string" || (typeof id === "number" && Number.isFinite(id));
const ungueltig = (id = null) => ({ jsonrpc: "2.0", id, error: { code: -32600, message: "Ungueltige Anfrage" } });
const hat = (o, k) => Object.hasOwn(o, k);

async function verarbeiteNachricht(ctx, nachricht, log) {
  if (nachricht === null || typeof nachricht !== "object" || Array.isArray(nachricht)) return ungueltig();
  const istAnfrage = hat(nachricht, "id");
  if (istAnfrage && !gueltigeId(nachricht.id)) return ungueltig();
  // Antworten des Clients auf Server-Anfragen gibt es hier nicht: ignorieren.
  if (!hat(nachricht, "method") && (hat(nachricht, "result") || hat(nachricht, "error"))) return null;
  if (nachricht.jsonrpc !== "2.0" || typeof nachricht.method !== "string") return ungueltig(istAnfrage ? nachricht.id : null);
  const params = nachricht.params ?? {};
  if (typeof params !== "object" || Array.isArray(params)) {
    return istAnfrage ? { jsonrpc: "2.0", id: nachricht.id, error: { code: -32602, message: "params muss ein Objekt sein" } } : null;
  }
  if (!istAnfrage) return null; // notifications/initialized, notifications/cancelled, ...
  const start = Date.now();
  try {
    const result = await methode(ctx, nachricht.method, params);
    log(`${logName(nachricht.method)}${nachricht.method === "tools/call" ? ` ${logName(nachricht.params?.name)}` : ""} ${Date.now() - start}ms${result?.isError ? " tool-fehler" : ""}`);
    return { jsonrpc: "2.0", id: nachricht.id, result };
  } catch (error) {
    const code = error instanceof RpcFehler ? error.code : -32603;
    log(`${logName(nachricht.method)}${nachricht.method === "tools/call" ? ` ${logName(nachricht.params?.name)}` : ""} ${Date.now() - start}ms fehler ${code}`);
    return { jsonrpc: "2.0", id: nachricht.id, error: { code, message: error instanceof RpcFehler ? error.message : "Interner Fehler" } };
  }
}

// Methoden- und Werkzeugnamen kommen vom Client: ins Log nur, was wie ein
// Name aussieht, nie beliebiger Text.
function logName(wert) {
  return typeof wert === "string" && /^[A-Za-z0-9_/.-]{1,64}$/.test(wert) ? wert : "(ungueltig)";
}

export async function verarbeiteZeile(ctx, zeile, log = () => {}) {
  if (!zeile.trim()) return null;
  let nachricht;
  try {
    nachricht = JSON.parse(zeile);
  } catch {
    log("parse-fehler");
    return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  // Batches gibt es in MCP seit 2025-06-18 nicht mehr: ein Array ist ungueltig.
  if (Array.isArray(nachricht)) return JSON.stringify(ungueltig());
  const antwort = await verarbeiteNachricht(ctx, nachricht, log);
  return antwort ? JSON.stringify(antwort) : null;
}
