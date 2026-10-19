import assert from "node:assert/strict";
import { test } from "node:test";
import { erstelleStandWaechter } from "../app/stand-wechsel.mjs";

function aufbau({ stand = "s1", serverStand = "s1" } = {}) {
  const protokoll = { stand: 0, snapshot: [], uebernommen: [] };
  let uhr = 0;
  const server = { stand: serverStand };
  const waechter = erstelleStandWaechter({
    stand,
    jetzt: () => uhr,
    abstandMs: 1000,
    holeStand: async () => {
      protokoll.stand += 1;
      return server.stand;
    },
    holeSnapshot: async (bekannt) => {
      protokoll.snapshot.push(bekannt);
      return bekannt === server.stand ? null : { metadata: { stand: server.stand } };
    },
    uebernehme: (bundle) => protokoll.uebernommen.push(bundle.metadata.stand),
  });
  return { waechter, protokoll, server, ticke: (ms) => { uhr += ms; } };
}

test("gleicher Stand: nur die Kennung wird gefragt, kein Snapshot", async () => {
  const { waechter, protokoll } = aufbau();
  assert.equal(await waechter.pruefe(), false);
  assert.equal(protokoll.stand, 1);
  assert.deepEqual(protokoll.snapshot, []);
});

test("neuer Stand: Snapshot bedingt laden, uebernehmen, Stand merken", async () => {
  const { waechter, protokoll, server, ticke } = aufbau();
  server.stand = "s2";
  assert.equal(await waechter.pruefe(), true);
  assert.deepEqual(protokoll.snapshot, ["s1"]);
  assert.deepEqual(protokoll.uebernommen, ["s2"]);
  assert.equal(waechter.stand, "s2");
  ticke(5000);
  assert.equal(await waechter.pruefe(), false, "danach gilt s2 als bekannt");
  assert.deepEqual(protokoll.uebernommen, ["s2"]);
});

test("kurz hintereinander wird nicht erneut gefragt, gleichzeitige Pruefungen teilen sich einen Lauf", async () => {
  const { waechter, protokoll, ticke } = aufbau();
  const [a, b] = [waechter.pruefe(), waechter.pruefe()];
  assert.equal(a, b);
  await a;
  assert.equal(await waechter.pruefe(), false);
  assert.equal(protokoll.stand, 1);
  ticke(1000);
  await waechter.pruefe();
  assert.equal(protokoll.stand, 2);
});

test("erzwungen: ohne Kennungsabfrage und Abstand, 304 aendert nichts", async () => {
  const { waechter, protokoll, server } = aufbau();
  await waechter.pruefe();
  assert.equal(await waechter.pruefe({ erzwingen: true }), false);
  assert.equal(protokoll.stand, 1);
  assert.deepEqual(protokoll.snapshot, ["s1"]);
  server.stand = "s3";
  assert.equal(await waechter.pruefe({ erzwingen: true }), true);
  assert.deepEqual(protokoll.uebernommen, ["s3"]);
});

test("Fehler beim Fragen kommen beim Aufrufer an, der naechste Versuch laeuft wieder", async () => {
  let fehlschlag = true;
  let uhr = 0;
  const waechter = erstelleStandWaechter({
    stand: "s1",
    jetzt: () => uhr,
    holeStand: async () => {
      if (fehlschlag) throw new Error("offline");
      return "s1";
    },
    holeSnapshot: async () => null,
    uebernehme: () => assert.fail("nichts uebernehmen"),
  });
  await assert.rejects(waechter.pruefe(), /offline/);
  fehlschlag = false;
  uhr += 10_000;
  assert.equal(await waechter.pruefe(), false);
});
