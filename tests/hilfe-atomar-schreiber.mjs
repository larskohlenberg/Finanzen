// Hilfsprozess fuer tests/atomares-schreiben.test.mjs: ersetzt eine Datei in
// einer Endlosschleife abwechselnd mit zwei grossen Inhalten, bis er beendet
// wird. Meldet "bereit" nach dem ersten vollstaendigen Schreiben.
// Aufruf: node hilfe-atomar-schreiber.mjs <datei> <groesse>
import { ersetzeDatei } from "../app/tools/lib/datei.mjs";

const [datei, groesse] = process.argv.slice(2);
const inhalte = ["A", "B"].map((z) => z.repeat(Number(groesse)));
await ersetzeDatei(datei, inhalte[0]);
process.stdout.write("bereit\n");
for (let i = 1; ; i += 1) await ersetzeDatei(datei, inhalte[i % 2]);
