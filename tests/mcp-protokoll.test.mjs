// JSON-RPC-Huelle: ungueltige Anfragen bekommen -32600 statt Erfolg oder Schweigen.
import assert from "node:assert/strict";
import test from "node:test";
import { verarbeiteZeile } from "../app/mcp/protokoll.mjs";

const ctx = { app: "/nicht/benutzt", datenroot: "/nicht/benutzt", datenrootRel: "data/master", recht: "lesen" };
const antwort = async (wert) => {
  const zeile = await verarbeiteZeile(ctx, typeof wert === "string" ? wert : JSON.stringify(wert));
  return zeile === null ? null : JSON.parse(zeile);
};

test("Gueltige Anfrage und Benachrichtigung wie bisher", async () => {
  assert.deepEqual(await antwort({ jsonrpc: "2.0", id: 1, method: "ping" }), { jsonrpc: "2.0", id: 1, result: {} });
  assert.deepEqual(await antwort({ jsonrpc: "2.0", id: "a", method: "ping" }), { jsonrpc: "2.0", id: "a", result: {} });
  assert.equal(await antwort({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  // Antworten des Clients auf Server-Anfragen werden ignoriert.
  assert.equal(await antwort({ jsonrpc: "2.0", id: 7, result: {} }), null);
});

test("Falsche Version, falscher id-Typ, leeres Objekt und Arrays -> -32600", async () => {
  const faelle = [
    [{ jsonrpc: "9.9", id: 1, method: "ping" }, 1],
    [{ id: 2, method: "ping" }, 2],
    [{ jsonrpc: "2.0", id: { x: 1 }, method: "ping" }, null],
    [{ jsonrpc: "2.0", id: true, method: "ping" }, null],
    [{ jsonrpc: "2.0", id: 3, method: 5 }, 3],
    [{}, null],
    [[], null],
    [[{ jsonrpc: "2.0", id: 4, method: "ping" }], null],
    ["5", null],
  ];
  for (const [nachricht, id] of faelle) {
    const a = await antwort(nachricht);
    assert.ok(a, `${JSON.stringify(nachricht)} braucht eine Antwort`);
    assert.equal(a.error?.code, -32600, `${JSON.stringify(nachricht)}: ${JSON.stringify(a)}`);
    assert.equal(a.id, id, JSON.stringify(nachricht));
    assert.equal(a.jsonrpc, "2.0");
  }
});

test("params muss ein Objekt sein", async () => {
  const a = await antwort({ jsonrpc: "2.0", id: 9, method: "ping", params: [1] });
  assert.equal(a.error?.code, -32602);
  assert.equal(a.id, 9);
});
