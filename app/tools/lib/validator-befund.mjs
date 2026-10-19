// app/tools/lib/validator-befund.mjs
// Befund nach einem Schreiblauf (im Entwurf), einheitlich mit mitRollback (app/mcp/schreiben.mjs):
// Nur NEUE Validatorfehler machen den Lauf fehlgeschlagen (Exitcode 1). Fehler,
// die schon vor dem Lauf im Bestand standen, sind ein Hinweis. Verglichen wird
// ueber Code, Objekt und Feld der Befunde (neueBefunde), nicht ueber den Text.
import { loadMasterData, validateMasterData } from "../validator.mjs";
import { neueBefunde } from "../validate-core.mjs";

export async function validatorBefunde(root) {
  return validateMasterData(await loadMasterData(root)).befunde;
}

// Meldungstexte der Befunde in `nachher`, die `vorher` nicht hatte.
export function neueFehler(vorher, nachher) {
  return neueBefunde(vorher, nachher).map((b) => (typeof b === "string" ? b : b.meldung));
}

export async function meldeNachSchreiben(root, vorher, titel) {
  const nachher = await validatorBefunde(root);
  const neu = neueFehler(vorher, nachher);
  if (neu.length) {
    console.error(`${titel}: ${neu.length} neue(r) Validatorfehler`);
    for (const fehler of neu.slice(0, 20)) console.error(`- ${fehler}`);
    process.exitCode = 1;
  } else if (nachher.length) {
    console.error(`Validator: ${nachher.length} Fehler, alle schon vorher vorhanden.`);
  }
  return neu;
}
