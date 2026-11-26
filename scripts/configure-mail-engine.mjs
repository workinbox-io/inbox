import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function engineApi({origin,authorization}) {
  const endpoint=new URL(origin);if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('Use a loopback engine endpoint');
  return async(method,args)=>{
    const response=await fetch(new URL('/jmap/',endpoint),{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({using:['urn:ietf:params:jmap:core','urn:stalwart:jmap'],methodCalls:[[method,args,'0']]}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`${method}: HTTP ${response.status}`);
    const result=(await response.json()).methodResponses?.[0];if(result?.[0]!==method)throw new Error(`${method}: invalid response`);
    return result[1];
  };
}

export async function bootstrapMailEngine(settings) {
  const result=await engineApi(settings)('x:Bootstrap/set',{update:{singleton:{defaultHostname:settings.hostname,defaultDomain:settings.domain,requestTlsCertificate:false,generateDkimKeys:false,tracer:{'@type':'Stdout'}}}});
  if(!Object.hasOwn(result.updated??{},'singleton'))throw new Error('Bootstrap failed; existing configuration is retained: '+JSON.stringify(result.notUpdated));
}

/** Provision only a new, private engine. The HTTP endpoint must be reached over SSH/loopback. */
export async function configureMailEngine({origin,authorization,hostname,domain,certificateFile='/run/mail-tls/fullchain.pem',keyFile='/run/mail-tls/privkey.pem'}) {
  if(typeof hostname!=='string'||typeof domain!=='string'||![hostname,domain].every(value=>/^[a-zA-Z0-9.-]{1,253}$/.test(value)))throw new Error('Valid engine and certificate hostnames are required');
  const call=engineApi({origin,authorization});
  const domains=await call('x:Domain/query',{filter:{name:domain}});if(domains.ids?.length!==1)throw new Error('Bootstrap the internal domain first');
  const domainId=domains.ids[0];
  const users=await call('x:Account/query',{filter:{name:'workinbox-service',domainId}});if(users.ids?.length)throw new Error('Engine already provisioned; keep its existing API key');
  const certificate=await call('x:Certificate/set',{create:{mail:{certificate:{'@type':'File',filePath:certificateFile},privateKey:{'@type':'File',filePath:keyFile}}}});
  if(!certificate.created?.mail)throw new Error('Certificate configuration failed: '+JSON.stringify(certificate.notCreated));
  const listeners=await call('x:NetworkListener/get',{});
  const remove=listeners.list.filter(listener=>listener.protocol!=='http'||!Object.keys(listener.bind).some(bind=>bind.endsWith(':8080'))).map(listener=>listener.id);
  const configured=await call('x:NetworkListener/set',{destroy:remove,create:{imaps:{name:'workinbox-imaps',protocol:'imap',bind:{'0.0.0.0:993':true},useTls:true,implicitTls:true,maxConnections:100},https:{name:'workinbox-https',protocol:'http',bind:{'0.0.0.0:443':true},useTls:true,implicitTls:true,maxConnections:30}}});
  if(!configured.created?.imaps||!configured.created?.https||Object.keys(configured.notDestroyed??{}).length)throw new Error('TLS listener configuration failed');
  const admin=await call('x:Account/set',{create:{service:{'@type':'User',name:'workinbox-service',domainId,credentials:{'0':{'@type':'Password',secret:randomBytes(48).toString('base64url')}},roles:{'@type':'Admin'},permissions:{'@type':'Inherit'},encryptionAtRest:{'@type':'Disabled'}}}});
  const accountId=admin.created?.service?.id;if(!accountId)throw new Error('Service account creation failed: '+JSON.stringify(admin.notCreated));
  const credential=await call('x:ApiKey/set',{accountId,create:{bridge:{description:'Workinbox bridge',permissions:{'@type':'Inherit'}}}});
  const token=credential.created?.bridge?.secret;if(!token)throw new Error('Service API key creation failed');
  return {MAIL_ENGINE_DOMAIN_ID:domainId,MAIL_ENGINE_DOMAIN:domain,MAIL_ENGINE_URL:`https://${hostname}/jmap/`,MAIL_ENGINE_TOKEN:token,MAIL_ENGINE_IMAP_HOST:hostname};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const file=process.argv[2];if(!file)throw new Error('Pass the private .env path');
  const settings={origin:process.env.MAIL_BOOTSTRAP_URL??'http://127.0.0.1:18080',authorization:`Basic ${Buffer.from(process.env.STALWART_RECOVERY_ADMIN??'').toString('base64')}`,hostname:process.env.MAIL_CLIENT_IMAP_HOST,domain:process.env.MAIL_ENGINE_DOMAIN};
  if(process.argv[3]==='bootstrap'){await bootstrapMailEngine(settings);console.log('Bootstrapped private engine; restart before configuring TLS');process.exit(0);}
  const values=await configureMailEngine(settings);
  let text=readFileSync(file,'utf8');for(const [key,value] of Object.entries(values)){const pattern=new RegExp(`^${key}=.*$`,'m');text=pattern.test(text)?text.replace(pattern,`${key}=${value}`):text+`\n${key}=${value}`;}
  writeFileSync(file,text+'\n',{mode:0o600});console.log('Configured private TLS listeners and persisted the bridge API key');
}
