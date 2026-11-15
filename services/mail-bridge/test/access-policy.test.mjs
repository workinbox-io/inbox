import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Accounts } from '../src/accounts.mjs';
import { AccessPolicy } from '../src/access-policy.mjs';

const scope = createHash('sha256').update(JSON.stringify(['organization', 'person'])).digest('hex');
const connection = { address: 'person@example.com', imap: {host:'imap.example.com',port:993,username:'person',password:'private'}, smtp:{host:'smtp.example.com',port:465,username:'person',password:'private'} };
test('only a matching Workinbox actor can be attached to a scope, and owner IDs are encrypted', () => {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32));
  try {
    assert.throws(() => accounts.setOwner(scope, 'different', 'person'));
    accounts.setOwner(scope, 'organization', 'person');
    assert.deepEqual(accounts.owner(scope), { orgId:'organization', userId:'person' });
    assert.equal(accounts.owner('other'), null);
    assert.equal(accounts.db.prepare('SELECT encrypted FROM scope_owners').get().encrypted.includes('organization'), false);
  } finally { accounts.close(); }
});

test('membership removal closes native access before disconnect and never caches permission for sending', async () => {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32)); accounts.setOwner(scope, 'organization', 'person'); accounts.put(scope, 'connection', connection);
  let allowed = true, checks = 0; const events = [];
  const policy = new AccessPolicy(accounts, {url:'https://workinbox.test/authorize',token:'service-token',gateway:{setAccepting:value=>events.push(value)},disconnect:async (org,id)=>{assert.equal(events.at(-1),false);accounts.remove(org,id);} },async (_url,request)=>{
    checks++;assert.equal(request.redirect,'error');assert.equal(request.headers.authorization,'Bearer service-token');assert.deepEqual(JSON.parse(request.body).owners,[{scope,orgId:'organization',userId:'person'}]);
    return Response.json({valid:allowed?[scope]:[]});
  });
  try {
    assert.equal(await policy.authorize(scope),true);allowed=false;assert.equal(await policy.authorize(scope),false);assert.equal(checks,2);
    await policy.refresh();assert.equal(accounts.get(scope,'connection'),null);assert.deepEqual(events,[false,true]);
  } finally {await policy.stop();accounts.close();}
});

test('authorization failure closes native sessions and missing owners cannot authorize SMTP', async () => {
  const accounts = new Accounts(':memory:', 'ab'.repeat(32)); const events=[];
  const policy = new AccessPolicy(accounts,{url:'https://workinbox.test/authorize',token:'service-token',gateway:{setAccepting:value=>events.push(value)},disconnect:async()=>{}},async()=>Response.json({}, {status:503}));
  try {
    await assert.rejects(policy.authorize(scope),/owner must be confirmed/);assert.deepEqual(events,[false]);
    accounts.setOwner(scope,'organization','person');await assert.rejects(policy.authorize(scope),/unavailable/);assert.deepEqual(events,[false,false]);
    await policy.refresh();assert.deepEqual(events,[false,false,true]);
  } finally {await policy.stop();accounts.close();}
});

test('native authorization expires even if a later refresh stalls', async context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const accounts=new Accounts(':memory:','ab'.repeat(32));accounts.setOwner(scope,'organization','person');accounts.put(scope,'connection',connection);
  const events=[];
  const policy=new AccessPolicy(accounts,{url:'https://workinbox.test/authorize',token:'service-token',gateway:{setAccepting:value=>events.push(value)},disconnect:async()=>{}},async()=>Response.json({valid:[scope]}));
  try {await policy.refresh();assert.deepEqual(events,[true]);context.mock.timers.tick(45001);assert.deepEqual(events,[true,false]);}
  finally {await policy.stop();accounts.close();}
});

test('a delayed successful refresh cannot reopen native access using expired authorization', async context => {
  let time=0;context.mock.method(Date,'now',()=>time);
  const accounts=new Accounts(':memory:','ab'.repeat(32));accounts.setOwner(scope,'organization','person');accounts.put(scope,'connection',connection);const events=[];
  const policy=new AccessPolicy(accounts,{url:'https://workinbox.test/authorize',token:'service-token',gateway:{setAccepting:value=>events.push(value)},disconnect:async()=>{}},async()=>{time=45001;return Response.json({valid:[scope]});});
  try {await policy.refresh();assert.deepEqual(events,[false]);}finally{await policy.stop();accounts.close();}
});

test('losing a shared mailbox revokes only that profile while personal access stays active',async()=>{
  const accounts=new Accounts(':memory:','ab'.repeat(32));accounts.setOwner(scope,'organization','person');
  const personal=accounts.putHosted(scope,'personal','person@example.test'),shared=accounts.putHosted(scope,'shared','team@example.test');
  const revoked=[],events=[];
  const policy=new AccessPolicy(accounts,{url:'https://workinbox.test/authorize',token:'service-token',gateway:{setAccepting:value=>events.push(value)},disconnect:async()=>{},disconnectHosted:async(owner,id)=>{assert.equal(events.at(-1),false);revoked.push(id);accounts.disableHosted(owner,id);}},async(_url,request)=>{
    assert.deepEqual(JSON.parse(request.body).owners[0].mailboxIds,['personal','shared']);return Response.json({valid:[scope],mailboxes:{[scope]:['personal']}});
  });
  try{await policy.refresh();assert.deepEqual(revoked,[shared]);assert.equal(accounts.hosted(scope,personal).active,1);assert.equal(accounts.hosted(scope,shared).active,0);assert.deepEqual(events,[false,true]);}finally{await policy.stop();accounts.close();}
});
