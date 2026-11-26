export class SourceError extends Error {
  constructor(status, path) { super(`Workinbox mail HTTP ${status}`); this.status = status; this.path=path; }
}
export async function boundedBytes(body, max = 25 * 1024 * 1024) {
  let size = 0; const parts = [];
  for await (const chunk of body) { size += chunk.length; if (size > max) throw new Error('Message exceeds 25 MB'); parts.push(chunk); }
  return Buffer.concat(parts);
}
export class RootMail {
  constructor(accounts, scope, mailboxId, { url, token, signal }, transport = fetch) {
    this.owner = accounts.owner(scope);
    if (!this.owner) throw new Error('Workinbox actor required');
    this.scope=scope;this.mailboxId=mailboxId;this.base=new URL('./mailboxes/',url);this.token=token;this.signal=signal;this.transport=transport;
    if(this.base.protocol!=='https:' || this.base.username || this.base.password)throw new Error('HTTPS Workinbox endpoint required');
  }
  async request(path, method='GET', body) {
    const url=new URL(`${encodeURIComponent(this.mailboxId)}/${path}`,this.base);
    const response=await this.transport(url,{method,redirect:'error',signal:this.signal?AbortSignal.any([this.signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),headers:{authorization:`Bearer ${this.token}`,'x-workinbox-org':this.owner.orgId,'x-workinbox-user':this.owner.userId,'x-workinbox-scope':this.scope,'content-type':body instanceof Uint8Array?'message/rfc822':'application/json'},body:body instanceof Uint8Array?body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok)throw new SourceError(response.status,path);
    return response;
  }
  async json(path,method='GET',body) {return(await this.request(path,method,body)).json();}
  async raw(id) {return boundedBytes((await this.request(`raw/${encodeURIComponent(id)}`)).body);}
}
