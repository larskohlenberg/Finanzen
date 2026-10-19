// app/tools/lib/bestand-orte.mjs
// Welche Inbox, Importprofile, welcher Papierkorb und welche Belegablage
// gehoeren zu einem Datenbestand. data/master behaelt die gewachsenen Orte
// neben dem Bestand (data/inbox, data/import-profile, data/papierkorb, Belege/);
// jeder andere Bestand (z. B. data/demo) hat sie in seinem eigenen Ordner und
// keine Belegablage. So landet nie eine Demo-Datei in der echten Inbox und
// umgekehrt.
import { realpathSync } from "node:fs";
import path from "node:path";
import { bestandZumEntwurf } from "./schreiblauf.mjs";

// Verglichen wird ueber den echten Pfad (Symlinks, z. B. /var -> /private/var).
function echt(pfad) {
  try {
    return realpathSync(pfad);
  } catch {
    return path.resolve(pfad);
  }
}

export function bestandOrte(appPfad, datenrootPfad) {
  const app = path.resolve(appPfad);
  // Im Entwurf eines Schreiblaufs gelten die Orte des eigentlichen Bestands.
  const root = bestandZumEntwurf(datenrootPfad);
  if (root === path.join(app, "data", "master") || echt(root) === echt(path.join(app, "data", "master"))) {
    const daten = path.join(app, "data");
    return {
      inbox: path.join(daten, "inbox"),
      profile: path.join(daten, "import-profile"),
      papierkorb: path.join(daten, "papierkorb"),
      belege: path.join(app, "Belege"),
    };
  }
  return {
    inbox: path.join(root, "inbox"),
    profile: path.join(root, "import-profile"),
    papierkorb: path.join(root, "papierkorb"),
    belege: null,
  };
}
