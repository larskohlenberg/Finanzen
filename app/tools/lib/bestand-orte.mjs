// app/tools/lib/bestand-orte.mjs
// Welche Inbox, Importprofile, welcher Papierkorb und welche Belegablage
// gehoeren zu einem Datenbestand. data/master behaelt die gewachsenen Orte
// neben dem Bestand (data/inbox, data/import-profile, data/papierkorb, Belege/);
// jeder andere Bestand (z. B. data/demo) hat sie in seinem eigenen Ordner und
// keine Belegablage. So landet nie eine Demo-Datei in der echten Inbox und
// umgekehrt.
import { realpathSync } from "node:fs";
import path from "node:path";

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
  const root = path.resolve(datenrootPfad);
  if (echt(root) === path.join(echt(app), "data", "master")) {
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
