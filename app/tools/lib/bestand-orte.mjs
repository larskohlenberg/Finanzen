// app/tools/lib/bestand-orte.mjs
// Welche Inbox, Importprofile, welcher Papierkorb und welche Belegablage
// gehoeren zu einem Datenbestand. data/master behaelt die gewachsenen Orte
// neben dem Bestand (data/inbox, data/import-profile, data/papierkorb, Belege/;
// mit FINANZEN_DATEN am externen Datenort, siehe datenort.mjs);
// jeder andere Bestand (z. B. data/demo) hat sie in seinem eigenen Ordner und
// keine Belegablage. So landet nie eine Demo-Datei in der echten Inbox und
// umgekehrt.
import { realpathSync } from "node:fs";
import path from "node:path";
import { physisch } from "./datenort.mjs";
import { bestandZumEntwurf } from "./schreiblauf.mjs";

// Verglichen wird ueber den echten Pfad (Symlinks, z. B. /var -> /private/var).
function echt(pfad) {
  try {
    return realpathSync(pfad);
  } catch {
    return path.resolve(pfad);
  }
}

export function bestandOrte(appPfad, datenrootPfad, env = process.env) {
  const app = path.resolve(appPfad);
  // Im Entwurf eines Schreiblaufs entscheidet der eigentliche Bestand, ob es
  // data/master ist (Orte daneben, ausserhalb des Entwurfs). Jeder andere
  // Bestand hat seine Orte im eigenen Ordner, im Entwurf also im Entwurf:
  // sonst naehme das Uebernehmen die Verschiebungen dort wieder zurueck.
  const original = bestandZumEntwurf(datenrootPfad);
  const root = path.resolve(datenrootPfad);
  const ort = (relativ) => physisch(app, relativ, env);
  const master = ort("data/master");
  if (original === master || echt(original) === echt(master)) {
    return {
      inbox: ort("data/inbox"),
      profile: ort("data/import-profile"),
      papierkorb: ort("data/papierkorb"),
      belege: ort("Belege"),
    };
  }
  return {
    inbox: path.join(root, "inbox"),
    profile: path.join(root, "import-profile"),
    papierkorb: path.join(root, "papierkorb"),
    belege: null,
  };
}
