/**
 * Rewrites IMAP logins before authentication (mailbox address + tagged device password → engine account), then hands
 * the connection to a raw pipe. Only pre-auth lines are read; anything unusual (literals, size, attempts) goes raw
 * unchanged, so old `wi-…` logins and exotic clients keep working through Stalwart's own checks.
 */
const LIMIT = 16 * 1024;
const MAX_ATTEMPTS = 5;

const quote = value => `"${value.replace(/[\\"]/g, char => `\\${char}`)}"`;

/** Reads `count` atoms or quoted strings; null when the line holds anything else. */
export function imapArgs(text, count) {
  const out = []; let i = 0;
  while (out.length < count) {
    if (text[i] !== ' ') return null; i++;
    if (text[i] === '"') {
      let value = ''; i++;
      for (;;) {
        if (i >= text.length) return null;
        const char = text[i++];
        if (char === '"') break;
        if (char === '\\') { if (i >= text.length) return null; value += text[i++]; } else value += char;
      }
      out.push(value);
    } else {
      const atom = /^[^\s"(){%*\\\]]+/.exec(text.slice(i));
      if (!atom) return null;
      out.push(atom[0]); i += atom[0].length;
    }
  }
  return i === text.length ? out : null;
}

const plain = (b64, resolve) => {
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  const parts = Buffer.from(b64, 'base64').toString('latin1').split('\0');
  if (parts.length !== 3) return null;
  const login = resolve(parts[1], parts[2]);
  return login && Buffer.from(`\0${login.username}\0${login.password}`, 'latin1').toString('base64');
};

export class ImapLoginRewriter {
  /** `resolve(username, password)` → `{ username, password }` for the engine, or null to pass the login through. */
  constructor(resolve) { this.resolve = resolve; this.raw = false; this.input = ''; this.output = ''; this.pending = null; this.plain = null; this.attempts = 0; }

  /** Takes client bytes, returns the bytes to send upstream (everything buffered once the stream goes raw). */
  client(chunk) {
    if (this.raw) return chunk;
    this.input += chunk.toString('latin1');
    const out = [];
    let end;
    while (!this.raw && (end = this.input.indexOf('\r\n')) >= 0) {
      const line = this.input.slice(0, end); this.input = this.input.slice(end + 2);
      out.push(`${this.line(line)}\r\n`);
    }
    if (this.input.length > LIMIT || this.attempts > MAX_ATTEMPTS) this.raw = true;
    if (this.raw) { out.push(this.input); this.input = ''; }
    return Buffer.from(out.join(''), 'latin1');
  }

  line(line) {
    if (this.plain) {
      const tag = this.plain; this.plain = null; this.pending = tag;
      return (line !== '*' && plain(line, this.resolve)) || line;
    }
    if (/\{\d+\+?\}$/.test(line)) { this.raw = true; return line; }
    const command = /^([^\s]+) (LOGIN|AUTHENTICATE)( .*)$/i.exec(line);
    if (!command) return line;
    const [, tag, verb, rest] = command;
    this.attempts++; this.pending = tag;
    if (verb.toUpperCase() === 'LOGIN') {
      const args = imapArgs(rest, 2);
      const login = args && this.resolve(args[0], args[1]);
      return login ? `${tag} LOGIN ${quote(login.username)} ${quote(login.password)}` : line;
    }
    const sasl = /^ PLAIN(?: (\S+))?$/i.exec(rest);
    if (!sasl) return line;
    if (!sasl[1]) { this.pending = null; this.plain = tag; return line; }
    const encoded = sasl[1] !== '=' && plain(sasl[1], this.resolve);
    return encoded ? `${tag} AUTHENTICATE PLAIN ${encoded}` : line;
  }

  /** Client bytes still held when the server's OK switched the stream to raw. */
  flush() { const rest = Buffer.from(this.input, 'latin1'); this.input = ''; return rest; }

  /** Watches server bytes for the tagged answer to the login; OK switches to raw. */
  server(chunk) {
    if (this.raw) return;
    this.output += chunk.toString('latin1');
    let end;
    while ((end = this.output.indexOf('\r\n')) >= 0) {
      const line = this.output.slice(0, end); this.output = this.output.slice(end + 2);
      if (this.pending && line.startsWith(`${this.pending} `)) {
        if (/^\S+ OK\b/i.test(line)) { this.raw = true; return; }
        this.pending = null;
      }
    }
    if (this.output.length > LIMIT) this.raw = true;
  }
}
