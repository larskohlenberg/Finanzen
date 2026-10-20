// app/datum-eingabe.mjs
// Getipptes Datum in ISO (JJJJ-MM-TT): 20.10.2027, 20.10.27, 20/10/2027,
// 20102027 und 2027-10-20. Zweistellige Jahre liegen in 2000-2099. Leer ergibt
// "", Unlesbares oder ein Tag, den es nicht gibt (31.2.), ergibt null.
export function datumAusEingabe(text) {
  const s = String(text ?? "").trim();
  if (!s) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let jahr;
  let monat;
  let tag;
  if (m) [, jahr, monat, tag] = m.map(Number);
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s))) [, tag, monat, jahr] = m.map(Number);
  else if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s))) [, tag, monat, jahr] = m.map(Number);
  else return null;
  if (jahr < 100) jahr += 2000;
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  if (d.getUTCFullYear() !== jahr || d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) return null;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}
