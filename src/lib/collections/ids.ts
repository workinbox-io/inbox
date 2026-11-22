/**
 * Record IDs like Linear's: the collection's prefix and the record's number ("TSK-12"). A collection without a stored
 * prefix uses one made from its name. Pure, tested in test/collections.test.ts.
 */
export const PREFIX = /^[A-Z][A-Z0-9]{0,4}$/;

/** "Tasks" → "TAS", "Office equipment" → "OE", "Zażółć" → "ZAZ"; "REC" when nothing usable is left. */
export function prefixFrom(name: string) {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => /^[A-Z]/.test(w));
  if (!words.length) return "REC";
  return (words.length > 1 ? words.map((w) => w[0]).join("") : words[0]!).slice(0, words.length > 1 ? 4 : 3);
}

export const formatId = (prefix: string, n: number) => (n > 0 ? `${prefix}-${n}` : null);

/** "tsk-12" → { prefix: "TSK", number: 12 }; anything else null. */
export function parseId(s: string) {
  const m = /^([A-Za-z][A-Za-z0-9]{0,4})-(\d{1,9})$/.exec(s.trim());
  return m ? { prefix: m[1]!.toUpperCase(), number: Number(m[2]) } : null;
}
