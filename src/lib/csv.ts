/**
 * A small CSV reader for previews (components/workspace/file-viewer.tsx): quoted fields, doubled quotes, newlines in
 * quotes, commas or semicolons (whichever the first line uses more, as European exports do). Stops after `maxRows`.
 */
export function parseCsv(text: string, maxRows = 500): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0)
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === "") quoted = true
    else if (c === sep) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      if (rows.length >= maxRows) return rows
    } else field += c
  }
  if (field !== "" || row.length) rows.push([...row, field])
  return rows
}

/**
 * A cell spreadsheets won't run as a formula: = @ tab CR, or + - not followed by a plain number or phone, get a leading '.
 */
export const csvSafe = (s: string) => (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s().-]*$)/.test(s) ? `'${s}` : s);
