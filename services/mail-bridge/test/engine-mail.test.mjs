import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineMail } from '../src/engine-mail.mjs';

test('concurrent send bodies are rejected before buffering attachments', async () => {
  let release, started;
  const reading = new Promise(resolve => { started = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const replies = [], outbox = { enqueue: async () => ({ id:'queued' }) };
  const options = { accounts:{binding:()=>({accountId:'engine'})},engine:{},org:'scope',connectionId:'connection',path:'send',url:new URL('https://bridge.test/send'),res:{headersSent:false},outbox,send:(status,body)=>replies.push({status,body}) };
  const first=engineMail({...options,req:{method:'POST',async *[Symbol.asyncIterator](){started();await hold;yield Buffer.from('{}');}}});
  await reading;
  let secondBodyRead=false;
  await engineMail({...options,req:{method:'POST',async *[Symbol.asyncIterator](){secondBodyRead=true;yield Buffer.from('{}');}}});
  assert.equal(secondBodyRead,false);assert.equal(replies[0].status,503);
  release();await first;assert.equal(replies[1].status,202);assert.equal(outbox.receiving,false);
});
