// app/mcp/protokoll.mjs
// JSON-RPC 2.0 / MCP ohne SDK. verarbeiteZeile nimmt eine Zeile von stdin und
// liefert die Antwortzeile (oder null bei Benachrichtigungen).
import { holePrompt, leseRessource, listePrompts, listeRessourcen } from "./inhalte.mjs";
import { rufeWerkzeug, sichtbareWerkzeuge } from "./werkzeuge.mjs";

export const VERSIONEN = ["2025-06-18", "2025-03-26", "2024-11-05"];

class RpcFehler extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function anleitung(ctx) {
  return [
    `Finanzmodell, Datenroot ${ctx.datenrootRel}, Recht: ${ctx.recht}.`,
    "Zuerst status aufrufen und die Ressource finanzen://docs/agent-context lesen; Skills stehen als Prompts bereit.",
    "Alle Tool-Laeufe sind ohne schreiben:true eine Vorschau. Nach jedem Schreiben laeuft der Validator, neue Fehler setzen den Masterstand zurueck.",
    "Kategorien nur mit Beleg (Belegleiter E1-E4); ohne Beleg ist der Vorschlag KAT-012.",
  ].join(" ");
}

async function methode(ctx, name, params = {}) {
  switch (name) {
    case "initialize":
      return {
        protocolVersion: VERSIONEN.includes(params.protocolVersion) ? params.protocolVersion : VERSIONEN[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "finanzen", version: "1.0.0" },
        instructions: anleitung(ctx),
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: sichtbareWerkzeuge(ctx) };
    case "tools/call": {
      if (typeof params.name !== "string") throw new RpcFehler(-32602, "name fehlt");
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

async function verarbeiteNachricht(ctx, nachricht, log) {
  if (nachricht === null || typeof nachricht !== "object" || Array.isArray(nachricht)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Ungueltige Anfrage" } };
  }
  const istAnfrage = Object.hasOwn(nachricht, "id") && nachricht.id !== null;
  if (typeof nachricht.method !== "string") {
    // Antworten des Clients auf Server-Anfragen gibt es hier nicht: ignorieren.
    if (!istAnfrage || Object.hasOwn(nachricht, "result") || Object.hasOwn(nachricht, "error")) return null;
    return { jsonrpc: "2.0", id: nachricht.id, error: { code: -32600, message: "Ungueltige Anfrage" } };
  }
  if (!istAnfrage) return null; // notifications/initialized, notifications/cancelled, ...
  const start = Date.now();
  try {
    const result = await methode(ctx, nachricht.method, nachricht.params ?? {});
    log(`${nachricht.method}${nachricht.method === "tools/call" ? ` ${nachricht.params?.name}` : ""} ${Date.now() - start}ms${result?.isError ? " tool-fehler" : ""}`);
    return { jsonrpc: "2.0", id: nachricht.id, result };
  } catch (error) {
    const code = error instanceof RpcFehler ? error.code : -32603;
    log(`${nachricht.method} ${Date.now() - start}ms fehler ${code}`);
    return { jsonrpc: "2.0", id: nachricht.id, error: { code, message: error instanceof RpcFehler ? error.message : "Interner Fehler" } };
  }
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
  if (Array.isArray(nachricht)) {
    const antworten = (await Promise.all(nachricht.map((n) => verarbeiteNachricht(ctx, n, log)))).filter(Boolean);
    return antworten.length ? JSON.stringify(antworten) : null;
  }
  const antwort = await verarbeiteNachricht(ctx, nachricht, log);
  return antwort ? JSON.stringify(antwort) : null;
}
