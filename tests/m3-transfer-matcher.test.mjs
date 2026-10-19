// tests/m3-transfer-matcher.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTransfers } from "../app/tools/transfer-matcher.mjs";

function tx(id, konto, datum, betrag, zweck) {
  return { transaktion_id: id, konto_id: konto, buchungsdatum: datum, betrag, verwendungszweck: zweck, ist_transfer: false };
}

test("paart gegenlaeufige Buchungen mit gleichem Zweck", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen Mai"),
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Sparen Mai"),
  ];
  const { transfers, matched } = matchTransfers(transaktionen, []);
  assert.equal(matched.length, 1);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].typ, "intern");
  assert.equal(transfers[0].betrag, "500.00");
  assert.equal(transfers[0].abgang_transaktion_id, "TXN-20260505-000001");
  assert.equal(transfers[0].zugang_transaktion_id, "TXN-20260506-000002");
  assert.equal(transaktionen[0].ist_transfer, true);
  assert.equal(transaktionen[0].transfer_id, transfers[0].transfer_id);
  assert.equal(transaktionen[1].transfer_id, transfers[0].transfer_id);
});

test("paart nicht bei unterschiedlichem Verwendungszweck", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"),
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Etwas anderes"),
  ];
  const { matched } = matchTransfers(transaktionen, []);
  assert.equal(matched.length, 0);
});

test("paart nicht bei Datumsdifferenz groesser 3 Tage", () => {
  const transaktionen = [
    tx("TXN-20260501-000001", "KTO-001", "2026-05-01", "-500.00", "Sparen"),
    tx("TXN-20260510-000002", "KTO-004", "2026-05-10", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("paart nicht innerhalb desselben Kontos", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"),
    tx("TXN-20260505-000002", "KTO-001", "2026-05-05", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("ignoriert bereits gepaarte Transaktionen", () => {
  const transaktionen = [
    { ...tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"), ist_transfer: true, transfer_id: "TRF-20260505-001" },
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

// --- IBAN-Kopplung als zweiter Weg zum Auto-Match --------------------------
// Zwei Banken formatieren den Verwendungszweck verschieden (die eine haengt
// Name/BIC/IBAN an, die andere schreibt nur "UEbertrag"). Das Textkriterium
// kann dann systematisch nie greifen. Traegt eine Seite die IBAN des
// Gegenkontos, ist das ein strukturell staerkeres Signal als gleicher Freitext.

const konten = [
  { konto_id: "KTO-001", kontoreferenz: "DE11110000000000000011" },
  { konto_id: "KTO-002", kontoreferenz: "DE22220000000000000022" },
];

test("paart ueber die IBAN-Kopplung, auch wenn der Verwendungszweck abweicht", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-2000.00", "Uebertrag Erika Mustermann BIC: BYLADEM1001 IBAN: DE11110000000000000011"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "2000.00", "UEbertrag"),
  ];
  const { transfers, matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 1);
  assert.equal(transfers[0].abgang_transaktion_id, "TXN-20260601-000001");
  assert.equal(transfers[0].zugang_transaktion_id, "TXN-20260602-000002");
  assert.equal(transaktionen[0].ist_transfer, true);
  assert.equal(transaktionen[1].ist_transfer, true);
});

test("IBAN-Vergleich ignoriert Leerzeichen und Gross-/Kleinschreibung", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "egal"), empfaenger_iban: "de11 1100 0000 0000 0000 11" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "anders"),
  ];
  assert.equal(matchTransfers(transaktionen, [], konten).matched.length, 1);
});

test("paart nicht, wenn die IBAN auf ein Konto ausserhalb des Modells zeigt", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "Miete"), empfaenger_iban: "DE00999999999999999999" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "Etwas anderes"),
  ];
  assert.equal(matchTransfers(transaktionen, [], konten).matched.length, 0);
});

test("ohne Konten-Liste bleibt das alte Textverhalten unveraendert", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "Uebertrag mit IBAN"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "UEbertrag"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("zwei gleich hohe Uebertraege im selben Fenster werden paarweise zugeordnet", () => {
  // Der greedy Lauf muss die N-zu-N-Situation sauber aufloesen und darf keine
  // Buchung zweimal verbrauchen.
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-500.00", "a"), empfaenger_iban: "DE11110000000000000011" },
    { ...tx("TXN-20260601-000002", "KTO-002", "2026-06-01", "-500.00", "b"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000003", "KTO-001", "2026-06-02", "500.00", "c"),
    tx("TXN-20260602-000004", "KTO-001", "2026-06-02", "500.00", "d"),
  ];
  const { matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 2);
  assert.equal(new Set(transaktionen.map((t) => t.transfer_id)).size, 2, "jede Buchung genau einem Transfer");
  assert.ok(transaktionen.every((t) => t.ist_transfer === true));
});

// --- Signal 3: IBAN im Verwendungszweck (Absender-IBAN nur im Text) --------
// Das Cashkonto eines Brokers nennt bei Eingaengen die Absender-IBAN nur im
// Text; die Gegenseite (PDF-Import) hat weder empfaenger_iban noch denselben
// Text. Alle IBANs hier sind erfundene Musterwerte (fiktive BLZ 00000000 bzw. die ISO-Beispiel-IBAN).

const kontenText = [
  { konto_id: "KTO-010", kontoreferenz: "DE89 3704 0044 0532 0130 00" }, // Girokonto
  { konto_id: "KTO-011", kontoreferenz: "DE60000000000000011111" }, // Cashkonto eines Brokers
  { konto_id: "KTO-012", kontoreferenz: "DE84000000000000022222" }, // drittes Konto
];

test("Signal iban-text: Eingang nennt die IBAN des Gegenkontos im Text -> Paar", () => {
  const transaktionen = [
    tx("TXN-20260701-000001", "KTO-010", "2026-07-01", "-750.00", "Uebertrag auf Depot"),
    tx("TXN-20260702-000002", "KTO-011", "2026-07-02", "750.00", "Incoming transfer from Max Muster (DE89 3704 0044 0532 0130 00)"),
  ];
  const { transfers, matched } = matchTransfers(transaktionen, [], kontenText);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].signal, "iban-text");
  assert.equal(transfers[0].abgang_transaktion_id, "TXN-20260701-000001");
  assert.equal(transfers[0].zugang_transaktion_id, "TXN-20260702-000002");
  assert.equal(transaktionen[1].empfaenger_iban, undefined, "Absender-IBAN wandert nicht in empfaenger_iban");
});

test("Signal iban-text: Ausgang nennt die IBAN des Gegenkontos kompakt im Text -> Paar", () => {
  const transaktionen = [
    tx("TXN-20260701-000001", "KTO-011", "2026-07-01", "-300.00", "Outgoing transfer for Max Muster (DE89370400440532013000)"),
    tx("TXN-20260702-000002", "KTO-010", "2026-07-02", "300.00", "Gutschrift"),
  ];
  const { matched } = matchTransfers(transaktionen, [], kontenText);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].signal, "iban-text");
});

test("Signal iban-text greift nicht, wenn die IBAN im Text auf ein drittes Konto zeigt", () => {
  const transaktionen = [
    tx("TXN-20260701-000001", "KTO-010", "2026-07-01", "-750.00", "Uebertrag auf Depot"),
    tx("TXN-20260702-000002", "KTO-011", "2026-07-02", "750.00", "Incoming transfer from Max Muster (DE84000000000000022222)"),
  ];
  assert.equal(matchTransfers(transaktionen, [], kontenText).matched.length, 0);
});

test("Signal iban-text greift nicht, wenn die IBAN im Text kein Modellkonto ist", () => {
  const transaktionen = [
    tx("TXN-20260701-000001", "KTO-010", "2026-07-01", "-750.00", "Uebertrag auf Depot"),
    tx("TXN-20260702-000002", "KTO-011", "2026-07-02", "750.00", "Incoming transfer from Max Muster (DE11 0000 0000 0000 0333 33)"),
  ];
  assert.equal(matchTransfers(transaktionen, [], kontenText).matched.length, 0);
});

test("Signal iban-text greift nicht, wenn der Text die eigene IBAN nennt", () => {
  const transaktionen = [
    tx("TXN-20260701-000001", "KTO-010", "2026-07-01", "-750.00", "Uebertrag"),
    tx("TXN-20260702-000002", "KTO-011", "2026-07-02", "750.00", "Eingang auf DE60000000000000011111"),
  ];
  assert.equal(matchTransfers(transaktionen, [], kontenText).matched.length, 0);
});

// --- Gestaffeltes Datumsfenster -------------------------------------------
// Text-Gleichheit bleibt bei 3 Tagen; strukturelle Signale duerfen 5 Tage
// ueberbruecken (Monatsende plus Wochenende/Feiertag).

test("Fenster: IBAN-gekoppelt mit 5 Tagen Abstand -> Paar", () => {
  const transaktionen = [
    { ...tx("TXN-20260630-000001", "KTO-002", "2026-06-30", "-400.00", "Dauerauftrag"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260705-000002", "KTO-001", "2026-07-05", "400.00", "Gutschrift"),
  ];
  const { matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].signal, "iban");
});

test("Fenster: IBAN-gekoppelt mit 6 Tagen Abstand -> kein Paar", () => {
  const transaktionen = [
    { ...tx("TXN-20260630-000001", "KTO-002", "2026-06-30", "-400.00", "Dauerauftrag"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260706-000002", "KTO-001", "2026-07-06", "400.00", "Gutschrift"),
  ];
  assert.equal(matchTransfers(transaktionen, [], konten).matched.length, 0);
});

test("Fenster: Text-gleich mit 4 Tagen Abstand -> kein Paar", () => {
  const transaktionen = [
    tx("TXN-20260501-000001", "KTO-001", "2026-05-01", "-500.00", "Sparen"),
    tx("TXN-20260505-000002", "KTO-004", "2026-05-05", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("Fenster: Text-gleich mit 3 Tagen Abstand -> Paar mit Signal zweck", () => {
  const transaktionen = [
    tx("TXN-20260501-000001", "KTO-001", "2026-05-01", "-500.00", "Sparen"),
    tx("TXN-20260504-000002", "KTO-004", "2026-05-04", "500.00", "Sparen"),
  ];
  const { matched } = matchTransfers(transaktionen, []);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].signal, "zweck");
});

test("Fenster: Text-gleich mit 4 Tagen reicht, wenn zusaetzlich die IBAN koppelt", () => {
  const transaktionen = [
    { ...tx("TXN-20260501-000001", "KTO-002", "2026-05-01", "-500.00", "Sparen"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260505-000002", "KTO-001", "2026-05-05", "500.00", "Sparen"),
  ];
  const { matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].signal, "iban");
});

// --- Eindeutigkeit statt greedy ---------------------------------------------

test("naechstes Gegenstueck gewinnt, nicht das zuerst gefundene", () => {
  // Greedy haette den Ausgang mit der 4 Tage frueheren Gutschrift gepaart.
  const transaktionen = [
    { ...tx("TXN-20260626-000001", "KTO-002", "2026-06-26", "-400.00", "Dauerauftrag"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260630-000002", "KTO-001", "2026-06-30", "400.00", "Gutschrift alt"),
    { ...tx("TXN-20260630-000003", "KTO-002", "2026-06-30", "-400.00", "Dauerauftrag"), empfaenger_iban: "DE11110000000000000011" },
  ];
  const { matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].from, "TXN-20260630-000003");
  assert.equal(matched[0].to, "TXN-20260630-000002");
});

test("Mehrdeutigkeit: zwei gleich weit entfernte Gegenstuecke auf verschiedenen Konten -> kein Paar, gemeldet", () => {
  const transaktionen = [
    tx("TXN-20260801-000001", "KTO-001", "2026-08-01", "-200.00", "Sparen"),
    tx("TXN-20260802-000002", "KTO-004", "2026-08-02", "200.00", "Sparen"),
    tx("TXN-20260802-000003", "KTO-005", "2026-08-02", "200.00", "Sparen"),
  ];
  const out = matchTransfers(transaktionen, []);
  assert.equal(out.matched.length, 0);
  assert.equal(out.transfers.length, 0);
  assert.ok(transaktionen.every((t) => t.ist_transfer === false && t.transfer_id === undefined));
  assert.equal(out.mehrdeutig.length, 1);
  assert.equal(out.mehrdeutig[0].transaktion_id, "TXN-20260801-000001");
  assert.deepEqual(out.mehrdeutig[0].kandidaten, ["TXN-20260802-000002", "TXN-20260802-000003"]);
  assert.equal(out.mehrdeutig[0].tage, 1);
});

test("Mehrdeutigkeit: Gegenstuecke davor und danach im gleichen Abstand -> kein Paar, gemeldet", () => {
  const transaktionen = [
    tx("TXN-20260801-000001", "KTO-004", "2026-08-01", "200.00", "Sparen"),
    tx("TXN-20260802-000002", "KTO-001", "2026-08-02", "-200.00", "Sparen"),
    tx("TXN-20260803-000003", "KTO-004", "2026-08-03", "200.00", "Sparen"),
  ];
  const out = matchTransfers(transaktionen, []);
  assert.equal(out.matched.length, 0);
  assert.equal(out.mehrdeutig.length, 1);
  assert.equal(out.mehrdeutig[0].transaktion_id, "TXN-20260802-000002");
});

test("ohne Mehrdeutigkeit ist das Feld mehrdeutig leer", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"),
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Sparen"),
  ];
  assert.deepEqual(matchTransfers(transaktionen, []).mehrdeutig, []);
});

// --- Leerer Verwendungszweck ist kein Signal (Review 0A.3) ------------------
// Zwei leere Texte sind nicht "gleich" im Sinne eines Uebertrags: ohne dieses
// Gate wuerden −50/+50 ohne Text auf zwei Konten zum internen Transfer, und
// Ausgabe wie Einnahme fielen aus den Auswertungen.

test("zwei leere Verwendungszwecke loesen keinen Transfer aus", () => {
  const transaktionen = [
    tx("TXN-20260901-000001", "KTO-001", "2026-09-01", "-50.00", ""),
    tx("TXN-20260901-000002", "KTO-004", "2026-09-01", "50.00", ""),
    tx("TXN-20260902-000003", "KTO-001", "2026-09-02", "-60.00", "   "),
    tx("TXN-20260902-000004", "KTO-004", "2026-09-02", "60.00", undefined),
  ];
  const out = matchTransfers(transaktionen, []);
  assert.equal(out.matched.length, 0);
  assert.equal(out.transfers.length, 0);
  assert.ok(transaktionen.every((t) => t.ist_transfer === false && t.transfer_id === undefined));
});

test("leere Verwendungszwecke erzeugen auch keine Mehrdeutigkeit", () => {
  const transaktionen = [
    tx("TXN-20260901-000001", "KTO-001", "2026-09-01", "-200.00", ""),
    tx("TXN-20260902-000002", "KTO-004", "2026-09-02", "200.00", ""),
    tx("TXN-20260902-000003", "KTO-005", "2026-09-02", "200.00", ""),
  ];
  const out = matchTransfers(transaktionen, []);
  assert.equal(out.matched.length, 0);
  assert.deepEqual(out.mehrdeutig, []);
});

test("leerer Verwendungszweck verhindert die IBAN-Kopplung nicht", () => {
  const transaktionen = [
    { ...tx("TXN-20260901-000001", "KTO-001", "2026-09-01", "-75.00", ""), empfaenger_iban: "DE22220000000000000022" },
    tx("TXN-20260902-000002", "KTO-002", "2026-09-02", "75.00", ""),
  ];
  const out = matchTransfers(transaktionen, [], konten);
  assert.equal(out.matched.length, 1);
  assert.equal(out.matched[0].signal, "iban");
});
