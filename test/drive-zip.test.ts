import { describe, expect, it } from "vitest";
import { crc32, uniquePaths, zipStream } from "../src/lib/drive/zip";

const enc = new TextEncoder();
const stream = (text: string) => new Blob([text]).stream() as ReadableStream<Uint8Array>;

async function bytes(s: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(s).arrayBuffer());
}

describe("zip", () => {
  it("computes CRC32", () => {
    expect(crc32(enc.encode("hello"))).toBe(0x3610a686);
    expect(crc32(enc.encode(""))).toBe(0);
    // Streaming in two parts gives the same as one.
    expect(crc32(enc.encode("lo"), crc32(enc.encode("hel")))).toBe(0x3610a686);
  });

  it("writes an archive with folders, files and a central directory", async () => {
    const date = new Date("2026-11-10T12:00:00Z");
    const zip = await bytes(
      zipStream([
        { name: "Docs/", date },
        { name: "Docs/a.txt", date, open: async () => stream("hello") },
        { name: "gone.txt", date, open: async () => null },
        { name: "zażółć.txt", date, open: async () => stream("") },
      ]),
    );
    const v = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(3);
    const cdStart = v.getUint32(end + 16, true);
    expect(v.getUint32(cdStart, true)).toBe(0x02014b50);
    // The file's central entry carries the CRC and size and points at its local header.
    const second = cdStart + 46 + "Docs/".length;
    expect(v.getUint32(second + 16, true)).toBe(0x3610a686);
    expect(v.getUint32(second + 24, true)).toBe(5);
    expect(v.getUint32(v.getUint32(second + 42, true), true)).toBe(0x04034b50);
    expect(new TextDecoder().decode(zip)).toContain("zażółć.txt");
  });

  it("keeps paths unique", () => {
    expect(uniquePaths(["a.txt", "A.txt", "a.txt", "d/", "d/"])).toEqual(["a.txt", "A (2).txt", "a (3).txt", "d/", "d (2)/"]);
  });
});
