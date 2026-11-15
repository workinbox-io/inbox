import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers",()=>({env:{MAIL_BRIDGE_URL:"https://bridge.example.test",MAIL_BRIDGE_TOKEN:"test-service-token"}}));
vi.mock("@/lib/server/api",()=>({HttpError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
import { hostedAccountsRequest } from "@/lib/server/mail/bridge";
import { sha256Hex } from "@/lib/server/crypto";
const context={orgId:"org",url:new URL("https://workinbox.test/api/app/mail/native"),locals:{user:{id:"person"}}} as Parameters<typeof hostedAccountsRequest>[0];
afterEach(()=>vi.restoreAllMocks());

it("uses Workers-compatible manual redirects and server-derived actor headers",async()=>{
  const scope=await sha256Hex(JSON.stringify(["org","person"]));
  const fetch=vi.spyOn(globalThis,"fetch").mockImplementation(async(url,options)=>{
    expect(options?.redirect).toBe("manual");
    expect(String(url)).toBe(`https://bridge.example.test/orgs/${scope}/hosted`);
    const headers=new Headers(options?.headers);expect(headers.get("x-workinbox-org")).toBe("org");expect(headers.get("x-workinbox-user")).toBe("person");
    return Response.json({configured:true,connections:[]});
  });
  expect(await(await hostedAccountsRequest(context,"GET")).json()).toEqual({configured:true,connections:[]});expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects redirects without forwarding credentials to their destination",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(null,{status:302,headers:{location:"https://untrusted.example/"}}));
  await expect(hostedAccountsRequest(context,"GET")).rejects.toMatchObject({status:502});expect(fetch).toHaveBeenCalledTimes(1);
});

it("requires a session and rejects API-key identities before contacting the bridge",async()=>{
  const fetch=vi.spyOn(globalThis,"fetch");
  await expect(hostedAccountsRequest({...context,locals:{...context.locals,apiKeyId:"key"}},"GET")).rejects.toMatchObject({status:403});expect(fetch).not.toHaveBeenCalled();
});
