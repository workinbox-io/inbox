import { SMTPServer } from 'smtp-server';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import { RootMail, SourceError } from './root-mail.mjs';

const failure=(code,message)=>Object.assign(new Error(message),{responseCode:code});
const MAX_BYTES=10*1024*1024;

/** SMTP is an authenticated entrance to Workinbox's queue, never an engine relay. */
export class Submission {
  constructor({accounts,engine,key,cert,SNICallback,sourceConfig,verifyPassword}) {
    this.accepting=false;this.sockets=new Set();this.receiving=false;this.authenticating=0;
    const sessions=new WeakMap(),attempts=new WeakMap(),perIp=new Map();
    const verify=verifyPassword??(async(username,password)=>{
      const client=new ImapFlow({host:engine.imapTarget,port:engine.imapPort??993,secure:true,tls:{servername:engine.imapHost,rejectUnauthorized:true,minVersion:'TLSv1.2'},auth:{user:username,pass:password},logger:false,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000});
      client.on('error',()=>{});try{await client.connect();}finally{client.close();}
    });
    const current=async session=>{
      if(!this.accepting)throw failure(451,'Mailbox authorization temporarily unavailable');
      const auth=sessions.get(session),profile=auth&&accounts.submissionAccount(auth.username);
      if(!profile || profile.scope!==auth.scope || profile.id!==auth.id)throw failure(535,'Mailbox access unavailable');
      return {auth,profile,source:new RootMail(accounts,profile.scope,profile.mailbox_id,sourceConfig,sourceConfig.transport)};
    };
    const callbacks=(callback,action)=>Promise.resolve().then(action).then(value=>callback(null,value),error=>{
      const status=error instanceof SourceError?error.status:0;
      callback(error.responseCode?error:failure([400,403,404,409,413,422].includes(status)?550:451,'Message was not accepted; check mailbox access, limits and message size'));
    });
    this.server=new SMTPServer({secure:true,key,cert,SNICallback,minVersion:'TLSv1.2',authMethods:['PLAIN','LOGIN'],allowInsecureAuth:false,authOptional:false,disabledCommands:['STARTTLS'],size:MAX_BYTES,maxClients:30,socketTimeout:120000,logger:false,
      onConnect:(session,callback)=>callback(this.accepting?null:failure(421,'Mailbox authorization temporarily unavailable')),
      onAuth:(credentials,session,callback)=>callbacks(callback,async()=>{
        attempts.set(session,(attempts.get(session)??0)+1);if(attempts.get(session)>5)throw failure(454,'Too many authentication attempts; reconnect later');
        if(!this.accepting || this.authenticating>=2)throw failure(454,'Authentication temporarily unavailable');
        if(typeof credentials.username!=='string'||credentials.username.length>320||typeof credentials.password!=='string'||credentials.password.length>4096)throw failure(535,'Invalid credentials');
        const login=accounts.loginAccount(credentials.username,credentials.password)??{username:credentials.username,password:credentials.password};
        const profile=accounts.submissionAccount(login.username);if(!profile)throw failure(535,'Invalid credentials');
        this.authenticating++;
        try {
          const source=new RootMail(accounts,profile.scope,profile.mailbox_id,sourceConfig,sourceConfig.transport);const info=await source.json('folders');
          if(!info.submission)throw new Error('SMTP provider unavailable');
          await verify(login.username,login.password);
        }catch{throw failure(535,'Invalid credentials or mailbox access');}finally{this.authenticating--;}
        sessions.set(session,{scope:profile.scope,id:profile.id,username:login.username,password:login.password});return {user:credentials.username};
      }),
      onMailFrom:(address,session,callback)=>callbacks(callback,async()=>{
        const {profile}=await current(session);if(address.address.toLowerCase()!==profile.address.toLowerCase())throw failure(553,'Use this mailbox as the envelope sender');
      }),
      onRcptTo:(address,session,callback)=>callbacks(callback,async()=>{
        await current(session);if(!z.email().max(320).safeParse(address.address).success)throw failure(553,'Invalid recipient');
        if(session.envelope.rcptTo.length>=40)throw failure(452,'At most 40 recipients per message');
      }),
      onData:(stream,session,callback)=>callbacks(callback,async()=>{
        if(this.receiving){stream.resume();throw failure(452,'Submission busy; retry shortly');}
        this.receiving=true;
        try {
          const {auth,profile,source}=await current(session);
          const chunks=[];let size=0;
          for await(const chunk of stream){size+=chunk.length;if(size<=MAX_BYTES)chunks.push(chunk);}
          if(size>MAX_BYTES||stream.sizeExceeded)throw failure(552,'Maximum message size is 10 MB');
          await verify(auth.username,auth.password);
          const fresh=await current(session);if(fresh.profile.address!==profile.address)throw failure(553,'Mailbox address changed; reconnect');
          const recipients=session.envelope.rcptTo.map(recipient=>recipient.address);
          const result=await source.json(`submit?recipients=${encodeURIComponent(JSON.stringify(recipients))}`,'POST',Buffer.concat(chunks));
          return `Queued as ${result.outboxId}`;
        } finally {stream.resume();this.receiving=false;}
      }),
    });
    // The SMTP wrapper also emits failed client handshakes; only a listener error disables service.
    this.server.on('error',()=>{});
    this.server.server.on('error',()=>{this.setAccepting(false);console.error('[smtp] submission listener unavailable');});
    this.server.server.on('connection',socket=>{
      const ip=socket.remoteAddress,count=(perIp.get(ip)??0)+1;perIp.set(ip,count);this.sockets.add(socket);
      socket.once('close',()=>{this.sockets.delete(socket);const remaining=(perIp.get(ip)??1)-1;if(remaining)perIp.set(ip,remaining);else perIp.delete(ip);});
      if(!this.accepting||count>10)socket.destroy();
    });
  }
  setAccepting(value){this.accepting=value;if(!value)this.disconnectAll();}
  disconnectAll(){for(const socket of this.sockets)socket.destroy();}
  listen(port=1465,host='0.0.0.0'){return new Promise((resolve,reject)=>{this.server.server.once('error',reject);this.server.listen(port,host,()=>{this.server.server.off('error',reject);resolve();});});}
  async close(){this.disconnectAll();await new Promise(resolve=>this.server.close(resolve));}
}
