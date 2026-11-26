import { createServer, connect } from 'node:tls';
import { ImapLoginRewriter } from './imap-login.mjs';

/** Stalwart handles IMAP. This boundary lets revocation terminate cached client sessions. */
export class ImapGateway {
  constructor({ key, cert, SNICallback, host, servername, port = 993, resolveLogin }) {
    this.sockets = new Set(); this.accepting = true;
    const perIp = new Map();
    this.server = createServer({ key, cert, SNICallback, minVersion: 'TLSv1.2', handshakeTimeout: 10000 }, client => {
      if (!this.accepting || client.destroyed) { client.destroy(); return; }
      this.sockets.add(client);
      client.once('close', () => this.sockets.delete(client));
      const upstream = connect({ host, port, servername, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      const connected = setTimeout(() => { client.destroy(); upstream.destroy(); }, 10000);
      connected.unref();
      upstream.once('secureConnect', () => clearTimeout(connected));
      const close = () => { clearTimeout(connected); client.destroy(); upstream.destroy(); };
      client.on('error', close); upstream.on('error', close);
      client.on('close', close); upstream.on('close', close);
      client.setTimeout(30 * 60 * 1000, close); upstream.setTimeout(30 * 60 * 1000, close);
      if (!resolveLogin) { client.pipe(upstream).pipe(client); return; }
      // Logins are rewritten line by line until the server accepts one, then the connection becomes a plain pipe.
      const rewriter = new ImapLoginRewriter(resolveLogin);
      const raw = () => {
        client.off('data', fromClient); upstream.off('data', fromServer);
        const rest = rewriter.flush(); if (rest.length) upstream.write(rest);
        client.pipe(upstream); upstream.pipe(client);
      };
      const fromClient = chunk => { const out = rewriter.client(chunk); if (out.length) upstream.write(out); if (rewriter.raw) raw(); };
      const fromServer = chunk => { client.write(chunk); rewriter.server(chunk); if (rewriter.raw) raw(); };
      client.on('data', fromClient); upstream.on('data', fromServer);
    });
    this.server.maxConnections = 100;
    this.server.on('tlsClientError', () => {});
    this.server.on('connection', socket => {
      if (!this.accepting) { socket.destroy(); return; }
      const ip = socket.remoteAddress;
      const count = (perIp.get(ip) ?? 0) + 1;
      if (count > 10) { socket.destroy(); return; }
      perIp.set(ip, count); this.sockets.add(socket);
      socket.once('close', () => {
        this.sockets.delete(socket);
        const remaining = (perIp.get(ip) ?? 1) - 1;
        if (remaining) perIp.set(ip, remaining); else perIp.delete(ip);
      });
    });
  }
  listen(port = 1993, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => { this.server.off('error', reject); resolve(); });
    });
  }
  // Closing every device avoids parsing IMAP authentication; other devices reconnect normally.
  setAccepting(value) { this.accepting = value; if (!value) this.disconnectAll(); }
  disconnectAll() { for (const socket of this.sockets) socket.destroy(); }
  async close() { this.disconnectAll(); await new Promise(resolve => this.server.close(resolve)); }
}
