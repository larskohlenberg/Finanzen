// tests/pdf-muster.mjs
// Testhilfe ohne Fremdwerkzeug: ein echtes, mehrseitiges PDF fuer poppler und tesseract.

// Kleinstes gueltiges PDF mit einer Textzeile "Seite N" je Seite.
export function musterPdf(seiten) {
  const objekte = ["<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kinder = [];
  for (let nr = 1; nr <= seiten; nr += 1) {
    const inhalt = `BT /F1 24 Tf 72 720 Td (Seite ${nr}) Tj ET`;
    objekte.push(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);
    const inhaltNr = objekte.length;
    objekte.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${inhaltNr} 0 R >>`);
    kinder.push(`${objekte.length} 0 R`);
  }
  objekte[1] = `<< /Type /Pages /Kids [${kinder.join(" ")}] /Count ${seiten} >>`;
  let pdf = "%PDF-1.4\n";
  const versatz = [];
  objekte.forEach((o, i) => { versatz.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
