import { Readable } from 'node:stream';
import { z } from 'zod';
import { JmapError } from '../../../src/lib/mail/jmap.ts';
import { QueueConflict } from './mail-queue.mjs';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/);
const changes = z.object({ unread: z.boolean().optional(), starred: z.boolean().optional(), folderId: id.optional() }).strict().refine(value => Object.keys(value).length > 0);
async function body(req, schema, max = 32768) {
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > max) throw new RangeError('Body too large'); chunks.push(chunk); }
  return schema.parse(JSON.parse(Buffer.concat(chunks).toString()));
}

/** Returns only data of the engine account bound to this caller-owned connection. */
export async function engineMail({ accounts, engine, org, connectionId, path, url, req, res, send, readOnly = false, outbox }) {
  if (readOnly && req.method !== 'GET') { send(403, { error: 'This mailbox is read-only' }); return; }
  const binding = accounts.binding(org, connectionId);
  if (!engine || !binding?.accountId) { send(503, { error: 'Mailbox synchronization has not started' }); return; }
  const segments = path.split('/').filter(Boolean);
  if (!['folders', 'messages', 'send', 'outbox'].includes(segments[0]) || segments.length > 3 || (segments[1] && !id.safeParse(segments[1]).success)) { send(404, { error: 'Not found' }); return; }
  try {
    if (segments[0] === 'send' && segments.length === 1 && req.method === 'POST') {
      if (!outbox) { send(503, { error: 'Sending is not configured' }); return; }
      send(202, await outbox.enqueue(org, connectionId, await body(req, z.unknown(), 16 * 1024 * 1024))); return;
    }
    if (segments[0] === 'outbox') {
      if (!outbox) { send(503, { error: 'Sending is not configured' }); return; }
      if (req.method === 'GET' && segments.length === 1) { send(200, { jobs: outbox.list(org, connectionId) }); return; }
      if (req.method === 'DELETE' && segments.length === 2) { send(200, outbox.cancelJob(org, connectionId, segments[1])); return; }
      if (segments.length === 3 && segments[2] === 'draft') {
        if (req.method === 'GET') { send(200, { draft: outbox.recoverDraft(org, connectionId, segments[1]) }); return; }
        if (req.method === 'DELETE') { outbox.clearDraft(org, connectionId, segments[1]); send(200, { ok: true }); return; }
      }
      send(405, { error: 'Method not allowed' }); return;
    }
    const { client, downloadUrl } = await engine.mail(binding);
    if (segments[0] === 'folders' && segments.length === 1) {
      if (req.method === 'GET') { send(200, { ...await client.folders(), readOnly, canSend: !!outbox && !readOnly, hasOutbox: !!outbox }); return; }
      if (req.method === 'POST') {
        const input = await body(req, z.object({ name: z.string().trim().min(1).max(255), parentId: id.nullable().default(null) }).strict());
        send(201, { id: await client.createFolder(input.name, input.parentId) }); return;
      }
    }
    if (segments[0] === 'messages' && segments.length === 1 && req.method === 'GET') {
      const folder = id.parse(url.searchParams.get('folder'));
      const position = z.coerce.number().int().min(0).max(10000000).parse(url.searchParams.get('position') ?? 0);
      const query = await client.query(position, 50, { inMailbox: folder }, false);
      const messages = await client.summaries(query.ids);
      send(200, { ...messages, position, hasMore: query.ids.length === 50 }); return;
    }
    if (segments[0] === 'messages' && segments[1]) {
      const result = await client.contents([segments[1]]);
      const message = result.list[0];
      if (!message) { send(404, { error: 'Not found' }); return; }
      if (segments[2] === 'raw' && req.method === 'GET') {
        const response = await client.raw(downloadUrl, message.blobId);
        res.writeHead(200, { 'content-type': 'message/rfc822', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="message.eml"' });
        Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); return;
      }
      if (segments[2] === 'attachment' && req.method === 'GET') {
        const attachment = message.attachments.find(part => part.blobId === url.searchParams.get('blob'));
        if (!attachment) { send(404, { error: 'Attachment not found' }); return; }
        const filename = attachment.name ?? 'attachment';
        const response = await client.raw(downloadUrl, attachment.blobId, filename, attachment.type);
        res.writeHead(200, { 'content-type': attachment.type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` });
        Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); return;
      }
      if (segments.length !== 2) { send(404, { error: 'Not found' }); return; }
      if (req.method === 'GET') { send(200, { state: result.state, message }); return; }
      if (req.method === 'PATCH') {
        const input = await body(req, changes);
        const patch = {};
        if (input.unread !== undefined) patch['keywords/$seen'] = input.unread ? null : true;
        if (input.starred !== undefined) patch['keywords/$flagged'] = input.starred ? true : null;
        if (input.folderId !== undefined) {
          const folders = await client.folders();
          if (!folders.list.some(folder => folder.id === input.folderId)) { send(404, { error: 'Folder not found' }); return; }
          patch.mailboxIds = { [input.folderId]: true };
        }
        send(200, { state: await client.update(message.id, patch, result.state) }); return;
      }
      if (req.method === 'DELETE') {
        const folders = await client.folders();
        if (!folders.list.some(folder => folder.role === 'trash' && message.mailboxIds[folder.id])) { send(409, { error: 'Move the message to Trash before deleting permanently' }); return; }
        send(200, { state: await client.remove(message.id, result.state) }); return;
      }
    }
    send(405, { error: 'Method not allowed' });
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    if (error instanceof z.ZodError || error instanceof SyntaxError) send(422, { error: 'Invalid mailbox request' });
    else if (error instanceof RangeError) send(413, { error: 'Body too large' });
    else if (error instanceof QueueConflict) send(409, { error: error.message });
    else if (error instanceof JmapError && error.type === 'stateMismatch') send(409, { error: 'Mailbox changed. Refresh and retry.' });
    else send(502, { error: 'Mailbox operation failed' });
  }
}
