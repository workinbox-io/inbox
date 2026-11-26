/** Demo files' bytes, the same for every language of the story (content.ts, content-pl.ts). Pure. */

/** A one-page PDF with a title and a few lines (pdf.js tolerates the loose xref). */
export function pdf(title: string, lines: string[]) {
  // Helvetica in a bare PDF has no Polish letters: ą → a, ł → l, the rest becomes "?".
  const esc = (s: string) =>
    s.replace(/[łŁ]/g, (c) => (c === "ł" ? "l" : "L")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");
  const text = [`BT /F1 24 Tf 72 740 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 12 Tf 72 ${700 - i * 20} Td (${esc(l)}) Tj ET`)].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** fileBody for one language: PDFs from their lines, CSV and text files from their contents. */
export function fileBodies(csv: Record<string, string>, text: Record<string, string>, pdfLines: Record<string, string[]>) {
  return (name: string): { bytes: Uint8Array<ArrayBuffer>; type: string } => {
    if (name.endsWith(".pdf")) return { bytes: pdf(name.replace(/\.pdf$/, ""), pdfLines[name] ?? []), type: "application/pdf" };
    if (name.endsWith(".csv")) return { bytes: new TextEncoder().encode(csv[name] ?? ""), type: "text/csv" };
    return { bytes: new TextEncoder().encode(text[name] ?? `${name}\n`), type: "text/plain" };
  };
}
