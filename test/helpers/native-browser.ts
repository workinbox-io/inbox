import { createServer } from "node:https";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { env } from "cloudflare:workers";
import { account, db, eq, user } from "@/db";
import { hashPassword } from "better-auth/crypto";
import { getAuth } from "@/lib/server/auth";
import { onRequest } from "@/middleware";
import * as nativeIndex from "@/pages/api/app/mail/native/index";
import * as nativeConnection from "@/pages/api/app/mail/native/[id]/index";
import * as nativePasswords from "@/pages/api/app/mail/native/[id]/[...path]";
import * as internal from "@/pages/api/internal/mail-bridge/mailboxes/[id]/[...path]";
import * as settings from "@/pages/api/app/settings/[key]";
import * as external from "@/pages/api/app/mail/external-accounts/index";
import { hostedRoutes } from "../../services/mail-bridge/src/hosted-routes.mjs";

/** Real React forms, Better Auth cookies, membership middleware and mail routes; only Workers storage is substituted. */
export async function nativeBrowser({ accounts, engine, key, cert }: any) {
  const bundle = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {AuthForm} from './src/components/auth/auth-form';import {SettingsScreen} from './src/components/settings/settings-page';createRoot(document.getElementById('root')).render(location.pathname==='/login'?<AuthForm mode="login" next="/app/settings/mail-clients"/>:<SettingsScreen canManage={false}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'esm',define:{'process.env.NODE_ENV':'"production"'}});
  const password='native-browser-test-password';
  await db.update(user).set({emailVerified:true}).where(eq(user.id,'person'));
  await db.insert(account).values({id:'browser-login',accountId:'person',userId:'person',providerId:'credential',password:await hashPassword(password)});
  let appOrigin='',bridgeOrigin='',browser:any;
  const respond=async(res:any,response:Response)=>{res.statusCode=response.status;for(const [name,value] of response.headers)if(name!=='set-cookie')res.setHeader(name,value);const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);res.end(Buffer.from(await response.arrayBuffer()));};
  const web=createServer({key,cert},async(req,res)=>{
    try {
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
      const url=new URL(req.url!,appOrigin),request=new Request(url,{method:req.method,headers:req.headers as Record<string,string>,body:chunks.length?Buffer.concat(chunks):undefined});
      if(url.pathname==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
      if(url.pathname.startsWith('/api/auth/')){await respond(res,await getAuth().handler(request));return;}
      const parts=url.pathname.split('/');
      const ctx:any={request,url,locals:{},isPrerendered:false,params:{},redirect:(path:string)=>Response.redirect(new URL(path,appOrigin),302)};
      let route:any;
      if(url.pathname.startsWith('/api/internal/mail-bridge/mailboxes/')){ctx.params={id:parts[5],path:parts.slice(6).join('/')};route=internal;}
      else if(url.pathname.startsWith('/api/app/settings/')){ctx.params={key:parts[4]};route=settings;}
      else if(url.pathname==='/api/app/mail/external-accounts')route=external;
      else if(url.pathname==='/api/app/mail/native')route=nativeIndex;
      else if(url.pathname.startsWith('/api/app/mail/native/')){ctx.params={id:parts[5],path:parts.slice(6).join('/')};route=ctx.params.path?nativePasswords:nativeConnection;}
      const response=await onRequest(ctx,async()=>route?route[request.method](ctx):new Response('<!doctype html><div id="root"></div><script type="module" src="/bundle.js"></script>',{headers:{'content-type':'text/html'}}));
      if(!(response instanceof Response))throw new Error('Middleware returned no response');await respond(res,response);
    }catch(error){console.error('[native-browser] request failed',error);res.statusCode=500;res.end('Test request failed');}
  });
  const bridge=createServer({key,cert},async(req,res)=>{
    const send=(status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
    try {
      if(req.headers.authorization!==`Bearer ${env.MAIL_BRIDGE_TOKEN}`){send(401,{});return;}
      const list=/^\/orgs\/([^/]+)\/accounts$/.exec(req.url!);if(list&&req.method==='GET'){accounts.setOwner(list[1],req.headers['x-workinbox-org'],req.headers['x-workinbox-user']);send(200,accounts.list(list[1]));return;}
      const match=/^\/orgs\/([^/]+)\/hosted(?:\/([^/]+))?(?:\/(client-passwords)(?:\/([^/]+))?)?$/.exec(req.url!);if(!match){send(404,{});return;}
      const [,scope,mailboxId,passwords,passwordId]=match;accounts.setOwner(scope,req.headers['x-workinbox-org'],req.headers['x-workinbox-user']);
      await hostedRoutes({accounts,engine,scheduler:{run:()=>{}},enabled:true,scope,mailboxId,passwords,passwordId,req,send,clientHost:'imap.example.test',sourceConfig:{url:appOrigin+'/api/internal/mail-bridge/authorize',token:env.MAIL_BRIDGE_TOKEN},disconnect:async(owner:string,id:string)=>{await engine.revokeClientPasswords(accounts.binding(owner,id));accounts.disableHosted(owner,id);}});
    }catch(error){console.error('[native-browser] bridge failed',error);send(500,{});}
  });
  try {
    web.listen(0,'127.0.0.1');bridge.listen(0,'127.0.0.1');await Promise.all([once(web,'listening'),once(bridge,'listening')]);
    appOrigin=`https://localhost:${(web.address() as any).port}`;bridgeOrigin=`https://localhost:${(bridge.address() as any).port}`;
    Object.assign(env,{PUBLIC_APP_URL:appOrigin,BETTER_AUTH_SECRET:'browser-test-secret-32-characters-long',MAIL_BRIDGE_URL:bridgeOrigin,AUTH_RATE_LIMIT:{limit:async()=>({success:true})}});
    browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage();const errors:Error[]=[];page.on('pageerror',(error:Error)=>errors.push(error));
    const anonymous=await context.request.get(appOrigin+'/api/app/mail/native');if(anonymous.status()!==401)throw new Error('Mail settings accepted an anonymous session');
    await page.goto(appOrigin+'/login');if(await page.locator('form').getAttribute('method')!=='post')throw new Error('Auth form must not put credentials in a fallback GET URL');await page.getByLabel('Email',{exact:true}).fill('person@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/settings/mail-clients');
    await page.getByRole('button',{name:'IMAP clients',exact:true}).click();await page.getByText(/SMTP:.*imap.example.test/).waitFor();
    await page.getByLabel('Device name',{exact:true}).fill('Browser-created device');await page.getByRole('button',{name:'Create password',exact:true}).click();const secret=await page.getByLabel('New password · shown only now',{exact:true}).inputValue();if(!secret)throw new Error('No device password returned');
    if(await page.evaluate((value:string)=>JSON.stringify(localStorage).includes(value),secret))throw new Error('Device credentials leaked to local storage');
    await page.getByRole('dialog',{name:'Connect a mail client'}).getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'IMAP clients',exact:true}).click();await page.getByText('Browser-created device',{exact:true}).waitFor();if(await page.getByLabel('New password · shown only now',{exact:true}).count())throw new Error('Device password was displayed again');
    const passwordRow=page.getByText('Browser-created device',{exact:true}).locator('..');await passwordRow.getByRole('button',{name:'Revoke',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Revoke',exact:true}).click();await page.getByText('Browser-created device',{exact:true}).waitFor({state:'hidden'});
    if(errors.length)throw errors[0];console.log('Authenticated native settings browser flow: passed');
  }finally{await browser?.close();web.closeAllConnections();bridge.closeAllConnections();await Promise.all([new Promise<void>(resolve=>web.close(()=>resolve())),new Promise<void>(resolve=>bridge.close(()=>resolve()))]);}
}
