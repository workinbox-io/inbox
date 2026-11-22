import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImapLoginRewriter, imapArgs } from '../src/imap-login.mjs';

const resolve = (user, pass) => user === 'anna@acme.test' && pass === 'abcdefghij.secret' ? { username: 'wi-1@engine', password: 'secret' } : null;
const send = (rewriter, text) => rewriter.client(Buffer.from(text, 'latin1')).toString('latin1');
const b64 = text => Buffer.from(text, 'latin1').toString('base64');

test('parses atoms and quoted strings with escapes', () => {
  assert.deepEqual(imapArgs(' anna@acme.test "a\\"b\\\\c"', 2), ['anna@acme.test', 'a"b\\c']);
  assert.equal(imapArgs(' {5}', 2), null);
  assert.equal(imapArgs(' a b c', 2), null);
});

test('rewrites LOGIN with the mailbox address and goes raw after OK', () => {
  const r = new ImapLoginRewriter(resolve);
  assert.equal(send(r, 'a1 CAPABILITY\r\n'), 'a1 CAPABILITY\r\n');
  assert.equal(send(r, 'a2 LOGIN "anna@acme.test" '), '');
  assert.equal(send(r, 'abcdefghij.secret\r\n'), 'a2 LOGIN "wi-1@engine" "secret"\r\n');
  r.server(Buffer.from('* CAPABILITY IMAP4rev1\r\na2 OK done\r\n'));
  assert.equal(r.raw, true);
  assert.equal(send(r, 'a3 LOGIN anna@acme.test abcdefghij.secret\r\n'), 'a3 LOGIN anna@acme.test abcdefghij.secret\r\n');
});

test('keeps rewriting after a failed attempt', () => {
  const r = new ImapLoginRewriter(resolve);
  assert.equal(send(r, 'a1 LOGIN anna@acme.test wrong\r\n'), 'a1 LOGIN anna@acme.test wrong\r\n');
  r.server(Buffer.from('a1 NO bad\r\n'));
  assert.equal(r.raw, false);
  assert.equal(send(r, 'a2 LOGIN anna@acme.test abcdefghij.secret\r\n'), 'a2 LOGIN "wi-1@engine" "secret"\r\n');
});

test('rewrites AUTHENTICATE PLAIN with and without initial response', () => {
  const r = new ImapLoginRewriter(resolve);
  assert.equal(send(r, `a1 AUTHENTICATE PLAIN ${b64('\0anna@acme.test\0abcdefghij.secret')}\r\n`), `a1 AUTHENTICATE PLAIN ${b64('\0wi-1@engine\0secret')}\r\n`);
  const s = new ImapLoginRewriter(resolve);
  assert.equal(send(s, 'a1 AUTHENTICATE PLAIN\r\n'), 'a1 AUTHENTICATE PLAIN\r\n');
  assert.equal(send(s, `${b64('\0anna@acme.test\0abcdefghij.secret')}\r\n`), `${b64('\0wi-1@engine\0secret')}\r\n`);
  s.server(Buffer.from('a1 OK\r\n'));
  assert.equal(s.raw, true);
});

test('passes old engine logins, unknown tags and literals through unchanged', () => {
  const r = new ImapLoginRewriter(resolve);
  assert.equal(send(r, 'a1 LOGIN wi-1@engine secret\r\n'), 'a1 LOGIN wi-1@engine secret\r\n');
  assert.equal(send(r, 'a2 LOGIN anna@acme.test zzzzzzzzzz.secret\r\n'), 'a2 LOGIN anna@acme.test zzzzzzzzzz.secret\r\n');
  assert.equal(send(r, 'a3 LOGIN {14}\r\nanna@acme.test'), 'a3 LOGIN {14}\r\nanna@acme.test');
  assert.equal(r.raw, true);
});

test('holds client bytes sent before the OK and flushes them', () => {
  const r = new ImapLoginRewriter(resolve);
  send(r, 'a1 LOGIN anna@acme.test abcdefghij.secret\r\na2 SEL');
  r.server(Buffer.from('a1 OK\r\n'));
  assert.equal(r.flush().toString(), 'a2 SEL');
});
