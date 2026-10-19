import assert from "node:assert/strict";
import test from "node:test";
import { fokusSchluessel } from "../app/fokus.mjs";

// Attrappe eines Elements: Tag und Attribute in Reihenfolge des Markups.
const el = (tag, attrs) => ({
  tagName: tag.toUpperCase(),
  attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
  getAttribute: (name) => attrs[name] ?? null,
});

test("Fokus: data-fokus hat Vorrang, dann id", () => {
  assert.equal(fokusSchluessel(el("button", { "data-fokus": "rail.schliessen", "data-action": "x", id: "a" })), 'button[data-fokus="rail.schliessen"]');
  assert.equal(fokusSchluessel(el("input", { id: "filter-search", "data-filter": "search" })), 'input[id="filter-search"]');
});

test("Fokus: ohne beides alle data-Attribute, unabhaengig von ihrer Reihenfolge", () => {
  const a = fokusSchluessel(el("a", { class: "linkish", href: "#/x", "data-action": "open-vorsorge", "data-vorsorge": "VS-1" }));
  const b = fokusSchluessel(el("a", { "data-vorsorge": "VS-1", "data-action": "open-vorsorge" }));
  assert.equal(a, 'a[data-action="open-vorsorge"][data-vorsorge="VS-1"]');
  assert.equal(a, b);
});

test("Fokus: Werte werden fuer den Selektor maskiert, ohne Merkmal kein Schluessel", () => {
  assert.equal(fokusSchluessel(el("button", { "data-beleg": 'Belege/a "b".pdf' })), 'button[data-beleg="Belege/a \\"b\\".pdf"]');
  assert.equal(fokusSchluessel(el("button", { class: "x" })), null);
  assert.equal(fokusSchluessel(null), null);
});
