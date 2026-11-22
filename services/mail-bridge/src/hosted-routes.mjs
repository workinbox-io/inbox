import { z } from 'zod';
import { RootMail, SourceError } from './root-mail.mjs';
export async function hostedRoutes({accounts,engine,scheduler,enabled,scope,mailboxId,passwords,passwordId,req,send,disconnect,clientHost,sourceConfig}) {
  if(req.method==='GET'&&!mailboxId){send(200,{configured:enabled,connections:accounts.hostedList(scope)});return;}
  if(!enabled){send(503,{error:'Hosted mail access is not configured'});return;}
  const id=`hosted-${mailboxId}`;
  try {
    if(!passwords && req.method==='POST') {
      const source=new RootMail(accounts,scope,mailboxId,sourceConfig);const info=await source.json('folders');
      await accounts.exclusive(scope,id,()=>accounts.putHosted(scope,mailboxId,info.address));
      scheduler.run(scope,id);send(202,{connectionId:id});return;
    }
    if(!passwords && req.method==='DELETE'){await disconnect(scope,id);send(200,{ok:true});return;}
    const profile=accounts.hosted(scope,id),binding=accounts.binding(scope,id);
    if(!profile?.active || !binding?.accountId){send(404,{error:'Native mailbox is not enabled'});return;}
    if(passwords && req.method==='DELETE' && passwordId){await engine.revokeClientPassword(binding,passwordId);send(200,{ok:true});return;}
    const source=new RootMail(accounts,scope,mailboxId,sourceConfig);const info=await source.json('folders');
    if(passwords && req.method==='GET'&&!passwordId){send(200,{host:clientHost,port:993,security:'TLS',username:profile.address,smtp:info.submission?{host:clientHost,port:465,maxBytes:10*1024*1024}:null,passwords:await engine.clientPasswords(binding)});return;}
    if(passwords && req.method==='POST'&&!passwordId) {
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>32768){send(413,{error:'Body too large'});return;}chunks.push(chunk);}
      const input=z.object({description:z.string().trim().min(1).max(100).regex(/^[^\x00-\x1f\x7f]+$/)}).strict().parse(JSON.parse(Buffer.concat(chunks).toString()));
      const password=await accounts.exclusive(scope,id,async()=>{
        const current=accounts.hosted(scope,id);if(!current?.active||!current.initialized)throw new Error('Initial synchronization is not complete');
        const created=await engine.createClientPassword(binding,input.description,false);
        return {...created,secret:`${current.login_tag}.${created.secret}`};
      });
      send(201,password);return;
    }
    send(405,{error:'Method not allowed'});
  }catch(error){
    if(error instanceof z.ZodError||error instanceof SyntaxError)send(422,{error:'Invalid client settings'});
    else if(error instanceof SourceError&&[403,404].includes(error.status))send(403,{error:'Mailbox access changed'});
    else send(502,{error:'Native mailbox operation failed; existing mail is retained'});
  }
}
