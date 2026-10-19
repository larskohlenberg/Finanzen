// Hilfsprozess fuer tests/schreibsperre.test.mjs: haelt die Schreibsperre eines
// Bestands ueber mitRollback, meldet "gesperrt" auf stdout und wartet, bis
// stdin geschlossen wird. Aufruf: node hilfe-sperre-halter.mjs <datenroot>
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mitRollback } from "../app/mcp/schreiben.mjs";

const root = process.argv[2];
const r = await mitRollback(root, async () => {
  writeFileSync(join(root, "halter.txt"), "vom Halter");
  process.stdout.write("gesperrt\n");
  await new Promise((fertig) => { process.stdin.on("end", fertig); process.stdin.resume(); });
  return { text: "Halter fertig" };
});
process.stdout.write(`${r.isError ? "fehler" : "ok"}\n`);
