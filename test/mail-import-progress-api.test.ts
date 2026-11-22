import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ bridge: vi.fn(), boxes: vi.fn() }));
vi.mock("@/lib/server/api", () => ({
  HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  manageHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/server/mail/bridge", () => ({ imapImportsRequest: state.bridge }));
vi.mock("@/lib/server/mail/access", () => ({ viewerMailboxes: state.boxes }));
import { GET } from "@/pages/api/app/mail/imap-imports/progress";
import { HttpError } from "@/lib/server/api";
const context = { orgId: "org", role: "owner", locals: { user: { id: "person" } } } as any;
beforeEach(() => { state.bridge.mockReset(); state.boxes.mockReset().mockResolvedValue([{id:"box",address:"me@example.test"}]); });

it("returns progress only for accessible mailboxes and strips private source information", async () => {
  const job = {id:"job",mailboxId:"box",host:"private.example",username:"private-user",status:"running",copied:120,skipped:4,total:1000,etaSeconds:420,error:null};
  state.bridge.mockResolvedValue(Response.json({imports:[job,{...job,id:"foreign",mailboxId:"foreign"},{...job,id:"done",status:"done"},{...job,id:"cancelled",status:"cancelled"}]}));
  const response = await GET(context);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual([{id:"job",mailbox:"me@example.test",status:"running",processed:124,total:1000,etaSeconds:420}]);
  expect(state.boxes).toHaveBeenCalledWith({orgId:"org",userId:"person",role:"owner"});
});

it("handles an older bridge without inventing percentages or an ETA", async () => {
  state.bridge.mockResolvedValue(Response.json({imports:[{id:"old",mailboxId:"box",status:"failed",copied:1,skipped:0}]}));
  expect(await (await GET(context)).json()).toEqual([{id:"old",mailbox:"me@example.test",status:"failed",processed:1,total:null,etaSeconds:null}]);
});

it("hides unconfigured imports and rejects API-key identities before contacting the bridge", async () => {
  state.bridge.mockRejectedValue(new HttpError(503,"Not configured"));
  expect(await (await GET(context)).json()).toEqual([]);
  state.bridge.mockClear();
  await expect(GET({...context,locals:{user:{id:"person"},apiKeyId:"key"}})).rejects.toMatchObject({status:403});
  expect(state.bridge).not.toHaveBeenCalled();
});
