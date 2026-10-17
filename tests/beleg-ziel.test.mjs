import assert from "node:assert/strict";
import test from "node:test";
import { pruefeBelegZiel } from "../app/mcp/werkzeuge.mjs";

test("pruefeBelegZiel: Immobilien nur in festen Bereichen, Jahre nur in Laufende-Kosten und Vermietung", () => {
  for (const gut of [
    "Belege/Immobilien/IMM-001_Muster/Erwerb/IMM-001_Notar_Kaufvertrag_2020-01-01.pdf",
    "Belege/Immobilien/IMM-001_Muster/Bau/IMM-001_Architekt_Plan_2021.pdf",
    "Belege/Immobilien/IMM-001_Muster/Technik/IMM-001_PV_Protokoll_2023.pdf",
    "Belege/Immobilien/IMM-001_Muster/Laufende-Kosten/2025/IMM-001_Wasser_2025.pdf",
    "Belege/Immobilien/IMM-001_Muster/Vermietung/IMM-001_Mietvertrag_2022.pdf",
    "Belege/Immobilien/IMM-001_Muster/Vermietung/2025/IMM-001_Nebenkostenabrechnung-2025.pdf",
  ]) assert.equal(pruefeBelegZiel(gut), null, gut);

  for (const schlecht of [
    "Belege/Immobilien/Allgemein/2019/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/2021/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/Sonstiges/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/Bau/2021/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/Laufende-Kosten/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/Laufende-Kosten/25/x.pdf",
    "Belege/Immobilien/IMM-001_Muster/Vermietung/2025/Mieter/x.pdf",
  ]) assert.ok(pruefeBelegZiel(schlecht), schlecht);
});

test("pruefeBelegZiel: andere Klassen unveraendert, Allgemein dort weiter erlaubt", () => {
  assert.equal(pruefeBelegZiel("Belege/Konten/KTO-001_Bank/2025/x.pdf"), null);
  assert.equal(pruefeBelegZiel("Belege/Vorsorge/Allgemein/2025/x.pdf"), null);
  assert.ok(pruefeBelegZiel("Belege/Konten/KTO-001/x.pdf"));
});
