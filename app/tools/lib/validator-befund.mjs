// app/tools/lib/validator-befund.mjs
// Befund nach einem Schreiblauf, einheitlich mit mitRollback (app/mcp/schreiben.mjs):
// Nur NEUE Validatorfehler machen den Lauf fehlgeschlagen (Exitcode 1). Fehler,
// die schon vor dem Lauf im Bestand standen, sind ein Hinweis.
import { loadMasterData, validateMasterData } from "../validator.mjs";

export async function validatorFehler(root) {
  return validateMasterData(await loadMasterData(root)).errors;
}

export function neueFehler(vorher, nachher) {
  const bekannt = new Set(vorher);
  return nachher.filter((f) => !bekannt.has(f));
}

export async function meldeNachSchreiben(root, vorher, titel) {
  const nachher = await validatorFehler(root);
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
