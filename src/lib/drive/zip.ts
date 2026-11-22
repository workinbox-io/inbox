/**
 * A streaming ZIP writer: files are stored (no compression; most drive files are compressed already) and each one's
 * CRC and size follow its data in a data descriptor (flag bit 3), so nothing has to be buffered. Names are UTF-8
 * (bit 11). No ZIP64: callers keep archives under ZIP_MAX_BYTES and ZIP_MAX_ENTRIES. Web streams only, so it runs in
 * the Worker and in tests.
 */

export const ZIP_MAX_BYTES = 4 * 1024 ** 3 - 64 * 1024 ** 2;
export const ZIP_MAX_ENTRIES = 65_000;

export interface ZipEntry {
  /** Path inside the archive, "/" between folders; folders end with "/". */
  name: string;
  date: Date;
  /** The file's bytes; folders have none. Null skips the file (gone from storage). */
  open?: () => Promise<ReadableStream<Uint8Array> | null>;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

function dosTime(d: Date) {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function header(size: number, fill: (v: DataView) => void) {
  const buf = new Uint8Array(size);
  fill(new DataView(buf.buffer));
  return buf;
}

const enc = new TextEncoder();

async function* chunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  let count = 0;
  for (const entry of entries) {
    const dir = entry.name.endsWith("/");
    const stream = dir ? null : await entry.open?.();
    if (!dir && !stream) continue;
    const name = enc.encode(entry.name);
    const { time, date } = dosTime(entry.date);
    const flags = dir ? 0x0800 : 0x0808;
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, flags, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, time, true);
      v.setUint16(12, date, true);
      // CRC and sizes are 0 here: the data descriptor after the data has them.
      v.setUint16(26, name.length, true);
    });
    const start = offset;
    yield local;
    yield name;
    offset += local.length + name.length;
    let crc = 0;
    let size = 0;
    if (stream) {
      const reader = stream.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        crc = crc32(value, crc);
        size += value.length;
        yield value;
      }
      const descriptor = header(16, (v) => {
        v.setUint32(0, 0x08074b50, true);
        v.setUint32(4, crc, true);
        v.setUint32(8, size, true);
        v.setUint32(12, size, true);
      });
      yield descriptor;
      offset += size + descriptor.length;
    }
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint16(8, flags, true);
        v.setUint16(10, 0, true);
        v.setUint16(12, time, true);
        v.setUint16(14, date, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, size, true);
        v.setUint32(24, size, true);
        v.setUint16(28, name.length, true);
        v.setUint32(38, dir ? 0x10 : 0, true);
        v.setUint32(42, start, true);
      }),
      name,
    );
    count++;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const part of central) {
    cdSize += part.length;
    yield part;
  }
  yield header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, count, true);
    v.setUint16(10, count, true);
    v.setUint32(12, cdSize, true);
    v.setUint32(16, cdStart, true);
  });
}

/** The archive as a stream; entries are opened one at a time as the reader pulls. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const it = chunks(entries);
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

/** Archive paths that don't collide: "a.txt", "a (2).txt" within the same folder. */
export function uniquePaths(paths: string[]) {
  const seen = new Set<string>();
  return paths.map((p) => {
    let out = p;
    for (let i = 2; seen.has(out.toLowerCase()); i++) {
      const slash = p.endsWith("/") ? p.slice(0, -1) : p;
      const dot = slash.lastIndexOf(".");
      const cut = dot > slash.lastIndexOf("/") + 1 ? dot : slash.length;
      out = `${slash.slice(0, cut)} (${i})${slash.slice(cut)}${p.endsWith("/") ? "/" : ""}`;
    }
    seen.add(out.toLowerCase());
    return out;
  });
}
