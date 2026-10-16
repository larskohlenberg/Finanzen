// app/tools/lib/seiten.mjs
//
// Seitenplan fuer das Teilen eines Sammelscans (MCP-Tool beleg_teilen): jeder
// Teil nennt seine Seiten als "1-4", "5" oder "1-2,7". Jede Seite des PDFs
// gehoert genau einem Teil — nichts geht verloren, nichts wird verdoppelt.

// max begrenzt die Seitennummern, bevor ein Bereich aufgefaltet wird.
export function leseSeiten(angabe, max = Infinity) {
  const seiten = [];
  for (const stueck of String(angabe).split(",").map((s) => s.trim())) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(stueck);
    if (!m) throw new Error(`Seitenangabe "${angabe}" nicht lesbar (erwartet z. B. 1-4, 5 oder 1-2,7)`);
    const von = Number(m[1]);
    const bis = m[2] === undefined ? von : Number(m[2]);
    if (von < 1 || bis < von) throw new Error(`Seitenbereich "${stueck}" ungueltig`);
    if (bis > max) throw new Error(`Seite ${bis} gibt es nicht (das PDF hat ${max})`);
    for (let nr = von; nr <= bis; nr += 1) seiten.push(nr);
  }
  return seiten;
}

// teile: [{ seiten, name }]; liefert [{ name, seiten: [Nummern] }] oder wirft
// mit allen Fehlern.
export function planeTeilung(seitenzahl, teile) {
  const fehler = [];
  const vergeben = new Map();
  const plan = [];
  for (const teil of teile) {
    let seiten;
    try {
      seiten = leseSeiten(teil.seiten, seitenzahl);
    } catch (error) {
      fehler.push(`${teil.name}: ${error.message}`);
      continue;
    }
    for (const nr of seiten) {
      if (vergeben.has(nr)) fehler.push(`${teil.name}: Seite ${nr} gehoert schon zu ${vergeben.get(nr)}`);
      else vergeben.set(nr, teil.name);
    }
    plan.push({ name: teil.name, seiten });
  }
  const offen = [];
  for (let nr = 1; nr <= seitenzahl; nr += 1) if (!vergeben.has(nr)) offen.push(nr);
  if (offen.length) fehler.push(`Seiten ohne Teil: ${offen.join(", ")}`);
  if (fehler.length) throw new Error(fehler.join("\n"));
  return plan;
}
