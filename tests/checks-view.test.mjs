import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path);
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const runtime = await import("../app/runtime.mjs");
const checksView = await import("../app/views/checks.mjs");
const { data, state } = runtime;
const { renderChecks } = checksView;

test("Checks-View rendert ohne ReferenceError (Transfer- und Konto-Lookups)", () => {
  // Realistische Daten, die die Lookups transaktionenById/kontenById ausloesen.
  data.transfers = [
    {
      transfer_id: "TR-001",
      betrag: "100.00",
      abgang_transaktion_id: "TX-001",
      zugang_transaktion_id: "TX-002",
    },
  ];
  data.transaktionen = [
    {
      transaktion_id: "TX-001",
      ist_transfer: true,
      transfer_id: "TR-001",
      buchungsdatum: "2026-06-01",
      gegenpartei: "Sparkonto",
    },
    {
      transaktion_id: "TX-002",
      ist_transfer: true,
      transfer_id: "TR-001",
      buchungsdatum: "2026-06-01",
      gegenpartei: "Girokonto",
    },
  ];
  data.checks = [
    {
      scope: "konto",
      severity: "review",
      title_key: "checksPage.title",
      detail_key: "checksPage.lead",
      entity_id: data.konten[0]?.konto_id ?? "KON-001",
    },
  ];

  state.view = "checks";

  // Darf NICHT werfen (vorher: ReferenceError: transaktionenById is not defined).
  const html = renderChecks();
  assert.equal(typeof html, "string");
  assert.match(html, /TR-001/, "Transfer muss in der Liste erscheinen");
});

test("Checks listen nur unvollstaendige Transfers, der Zaehler zaehlt sie mit", () => {
  const ok = { transaktion_id: "TX-OK-A", ist_transfer: true, transfer_id: "TR-OK" };
  const okB = { transaktion_id: "TX-OK-B", ist_transfer: true, transfer_id: "TR-OK" };
  data.transfers = [
    { transfer_id: "TR-OK", betrag: "50.00", abgang_transaktion_id: "TX-OK-A", zugang_transaktion_id: "TX-OK-B" },
    { transfer_id: "TR-HALB", betrag: "20.00", abgang_transaktion_id: "TX-OK-A", zugang_transaktion_id: "TX-FEHLT" },
  ];
  runtime.transaktionenById.set(ok.transaktion_id, ok);
  runtime.transaktionenById.set(okB.transaktion_id, okB);
  data.checks = [];

  const html = checksView.renderChecks();
  assert.match(html, /TR-HALB/);
  assert.doesNotMatch(html, /TR-OK/, "vollstaendig gepaarte Transfers werden nicht aufgelistet");
  assert.doesNotMatch(html, /page-head/, "eingebettet in die Administration, ohne eigenen Seitenkopf");

  const ohneTransfer = (() => { data.transfers = []; return checksView.offeneChecksAnzahl(); })();
  data.transfers = [{ transfer_id: "TR-HALB", betrag: "20.00", abgang_transaktion_id: "TX-OK-A", zugang_transaktion_id: "TX-FEHLT" }];
  assert.equal(checksView.offeneChecksAnzahl(), ohneTransfer + 1);
});

test("Administration zeigt Checks und Export als Bereiche", async () => {
  const { renderMasterdata } = await import("../app/views/stammdaten.mjs");
  state.view = "masterdata";
  state.masterSection = "checks";
  let html = renderMasterdata();
  assert.match(html, /data-master-section="checks"/);
  assert.match(html, /data-master-section="export"/);
  assert.match(html, /Prognose-Realismus/);
  state.masterSection = "export";
  html = renderMasterdata();
  assert.match(html, /export-karten/);
});
