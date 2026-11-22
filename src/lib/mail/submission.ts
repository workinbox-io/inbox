/** Remove blind-recipient headers without re-encoding the MIME body or its attachments. */
export function withoutBlindHeaders(raw: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = [];
  let start = 0, hidden = false, changed = false;
  while (start < raw.length && start < 256 * 1024) {
    const newline = raw.indexOf(10, start);
    if (newline < 0) break;
    const end = newline > start && raw[newline - 1] === 13 ? newline - 1 : newline;
    if (end === start) {
      if (!changed) return raw;
      kept.push(raw.subarray(start));
      const result = new Uint8Array(kept.reduce((size, part) => size + part.length, 0));
      let offset = 0;
      for (const part of kept) { result.set(part, offset); offset += part.length; }
      return result;
    }
    if (raw[start] !== 32 && raw[start] !== 9) {
      const colon = raw.indexOf(58, start);
      if (colon < start + 1 || colon >= end) throw new Error("Malformed MIME header");
      const name = new TextDecoder().decode(raw.subarray(start, colon)).toLowerCase();
      if(!/^[!-9;-~]+$/.test(name))throw new Error("Malformed MIME header name");
      hidden = name === "bcc" || name === "resent-bcc";
    }
    if (hidden) changed = true;
    else kept.push(raw.subarray(start, newline + 1));
    start = newline + 1;
  }
  throw new Error("MIME headers are missing or exceed 256 KB");
}

export function sameSubmission(a: Uint8Array, b: Uint8Array) {
  const left = withoutBlindHeaders(a), right = withoutBlindHeaders(b);
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
