import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { publicHost } from './accounts.mjs';

export async function verify(account, resolveHost = publicHost) {
  const imapHost = await resolveHost(account.imap.host);
  const smtpHost = await resolveHost(account.smtp.host);
  const imap = new ImapFlow({ host: imapHost, port: account.imap.port, secure: true,
    tls: { servername: account.imap.host, rejectUnauthorized: true },
    auth: { user: account.imap.username, pass: account.imap.password },
    logger: false, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000 });
  imap.on('error', () => {});
  const smtp = nodemailer.createTransport({ host: smtpHost, port: account.smtp.port,
    secure: account.smtp.port !== 587, requireTLS: true,
    tls: { servername: account.smtp.host, rejectUnauthorized: true },
    auth: { user: account.smtp.username, pass: account.smtp.password },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000 });
  try {
    await imap.connect();
    const folders = (await imap.list()).map(({ path, specialUse }) => ({ path, specialUse }));
    await smtp.verify();
    return { ok: true, folders };
  } finally { imap.close(); smtp.close(); }
}

