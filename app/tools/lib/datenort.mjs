// app/tools/lib/datenort.mjs
// Wo die Echtdaten einer Installation liegen (Review 1.4, ADR 0036).
//
// Standard: im Code-Checkout, <app>/data/... und <app>/Belege. Mit
// FINANZEN_DATEN=<absoluter Ordner> liegen sie ausserhalb des Checkouts:
//   <ordner>/master (samt master.gen), inbox, import-profile, papierkorb, Belege
// Werkzeuge, Agenten und Browser sprechen weiter von data/master, data/inbox
// und Belege/ (logischer Pfad, relativ zum App-Raum); nur hier wird auf den Ort
// auf der Platte abgebildet. Die versionierten Beispieldaten (data/demo,
// data/demo-belege) bleiben immer im Checkout.
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

const VERSIONIERT = new Set(["demo", "demo-belege"]);

export class DatenortFehler extends Error {}

// Der externe Datenort oder null (Daten im Checkout).
export function externerDatenort(env = process.env) {
  const wert = env.FINANZEN_DATEN;
  if (wert === undefined || wert === "") return null;
  if (!path.isAbsolute(wert)) throw new DatenortFehler(`FINANZEN_DATEN muss ein absoluter Pfad sein, nicht "${wert}"`);
  return path.resolve(wert);
}

// Logischen Pfad (relativ zum App-Raum) auf den Ort auf der Platte abbilden.
export function physisch(app, relativ, env = process.env) {
  const absolut = path.resolve(app, relativ);
  const extern = externerDatenort(env);
  if (!extern) return absolut;
  const teile = path.relative(app, absolut).split(path.sep);
  if (teile[0] === "Belege") return path.join(extern, ...teile);
  if (teile[0] === "data" && teile.length > 1 && !VERSIONIERT.has(teile[1])) return path.join(extern, ...teile.slice(1));
  return absolut;
}

// Umkehrung: Ort auf der Platte -> logischer Pfad relativ zum App-Raum ("/").
export function logisch(app, absolut, env = process.env) {
  const extern = externerDatenort(env);
  const voll = path.resolve(absolut);
  if (extern && (voll === extern || voll.startsWith(`${extern}${path.sep}`))) {
    const teile = path.relative(extern, voll).split(path.sep).filter(Boolean);
    return teile[0] === "Belege" ? teile.join("/") : ["data", ...teile].join("/");
  }
  return path.relative(app, voll).split(path.sep).join("/");
}

// Alle Orte auf der Platte, die eine logische Wurzel abdeckt. "data" umfasst
// bei externem Datenort den Datenort und die Beispieldaten im Checkout.
export function physischeWurzeln(app, relativ, env = process.env) {
  const extern = externerDatenort(env);
  const absolut = path.resolve(app, relativ);
  if (extern && absolut === path.join(path.resolve(app), "data")) return [extern, absolut];
  return [physisch(app, relativ, env)];
}

// Gegen doppelte Bestaende: Mit externem Datenort muss er existieren, und im
// Checkout darf kein eigener data/master mehr liegen (hoechstens ein Symlink
// auf den externen Bestand). Sonst schreibt der eine Prozess hier, der andere
// dort. Rueckgabe: kurze Beschreibung fuer das Startprotokoll.
export function pruefeDatenort(app, env = process.env) {
  const extern = externerDatenort(env);
  if (!extern) return `Daten im Checkout (${path.join(app, "data")})`;
  let info;
  try {
    info = lstatSync(extern);
  } catch {
    throw new DatenortFehler(`FINANZEN_DATEN ${extern} existiert nicht`);
  }
  if (!info.isDirectory()) throw new DatenortFehler(`FINANZEN_DATEN ${extern} ist kein Ordner`);
  const alt = path.join(app, "data", "master");
  let altInfo = null;
  try { altInfo = lstatSync(alt); } catch { /* kein alter Bestand: gut */ }
  if (altInfo) {
    const echt = (p) => { try { return realpathSync(p); } catch { return null; } };
    const ziel = echt(path.join(extern, "master"));
    if (!altInfo.isSymbolicLink() || !ziel || echt(alt) !== ziel) {
      throw new DatenortFehler(`Doppelter Bestand: ${alt} liegt neben FINANZEN_DATEN ${extern}. Alten Bestand wegraeumen oder durch einen Symlink auf ${path.join(extern, "master")} ersetzen.`);
    }
  }
  return `Datenort ${extern}`;
}
