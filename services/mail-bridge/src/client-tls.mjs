import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';

export function clientTls(env = process.env) {
  const options = { key: readFileSync(env.MAIL_CLIENT_TLS_KEY), cert: readFileSync(env.MAIL_CLIENT_TLS_CERT) };
  if (env.MAIL_CLIENT_TLS_LEGACY_CERT || env.MAIL_CLIENT_TLS_LEGACY_KEY) {
    const legacy = { key: readFileSync(env.MAIL_CLIENT_TLS_LEGACY_KEY), cert: readFileSync(env.MAIL_CLIENT_TLS_LEGACY_CERT) };
    const certificate = new X509Certificate(legacy.cert), context = createSecureContext(legacy), current = createSecureContext(options);
    // Existing clients keep their trusted hostname while new clients use the default certificate.
    options.SNICallback = (hostname, callback) => callback(null, certificate.checkHost(hostname) ? context : current);
  }
  return options;
}
