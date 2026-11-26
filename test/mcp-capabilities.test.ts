import { beforeEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ env: { PUBLIC_APP_URL: "https://work.test" } }));
vi.mock("@/lib/server/api", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("@/lib/server/calendar/events", () => ({ getEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), hasExternalParticipants: vi.fn(), orgUsersByEmail: vi.fn(), createEvent: vi.fn(), getPrefs: vi.fn(), listEvents: vi.fn() }));
vi.mock("@/lib/server/drive/access", () => ({ requireItem: vi.fn() }));
vi.mock("@/lib/server/drive/items", () => ({ createFolder: vi.fn(), updateItem: vi.fn(), getItem: vi.fn(), listItems: vi.fn() }));
vi.mock("@/lib/server/drive/uploads", () => ({ putFile: vi.fn() }));
import { calendarTools } from "@/mcp/calendar";
import { driveTools } from "@/mcp/drive";
import { getEvent, updateEvent, deleteEvent, hasExternalParticipants, orgUsersByEmail } from "@/lib/server/calendar/events";
import { createFolder, updateItem } from "@/lib/server/drive/items";
import { putFile } from "@/lib/server/drive/uploads";
import type { McpContext, Tools } from "@/mcp/define";
const id = "11111111-1111-4111-8111-111111111111";
const master = "22222222-2222-4222-8222-222222222222";
const ctx: McpContext = { orgId: "org", userId: "me", role: "member", audit: vi.fn() };
const event = { id, seriesId: master, occurrence: 1000, rrule: "FREQ=DAILY", title: "Demo", role: "owner", start: 1000, end: 2000, attendees: [] };
const call = async (tools: Tools, name: string, input: unknown) => tools[name]!.run(tools[name]!.input!.parse(input), ctx);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getEvent).mockResolvedValue(event as never);
  vi.mocked(updateEvent).mockResolvedValue(event as never);
  vi.mocked(orgUsersByEmail).mockResolvedValue(new Map());
});
it("requires explicit series scopes and occurrence, routes exception scopes through the master", async () => {
  await expect(call(calendarTools, "calendar_update_event", { id, changes: { title: "New" } })).rejects.toMatchObject({ status: 422 });
  await expect(call(calendarTools, "calendar_delete_event", { id, scope: "following" })).rejects.toMatchObject({ status: 422 });
  expect(updateEvent).not.toHaveBeenCalled(); expect(deleteEvent).not.toHaveBeenCalled();
  for (const scope of ["this", "following", "all"]) {
    await call(calendarTools, "calendar_update_event", { id, scope, occurrence: "2026-11-17T10:00:00Z", changes: { title: "New" } });
    expect(updateEvent).toHaveBeenLastCalledWith({ orgId: "org", userId: "me", role: "member" }, master, { title: "New", scope, occurrence: Date.parse("2026-11-17T10:00:00Z") }, true);
    await call(calendarTools, "calendar_delete_event", { id, scope, occurrence: "2026-11-17T10:00:00Z" });
    expect(deleteEvent).toHaveBeenLastCalledWith(expect.anything(), master, expect.objectContaining({ scope }), true);
  }
});
it("returns an app link and never mutates existing external series or adds external attendees", async () => {
  vi.mocked(hasExternalParticipants).mockResolvedValue(true);
  expect(await call(calendarTools, "calendar_update_event", { id, scope: "all", changes: { title: "New" } })).toMatchObject({ changed: false, link: expect.stringContaining(id) });
  expect(await call(calendarTools, "calendar_delete_event", { id, scope: "all" })).toMatchObject({ deleted: false });
  vi.mocked(hasExternalParticipants).mockResolvedValue(false);
  expect(await call(calendarTools, "calendar_update_event", { id, scope: "all", changes: { attendees: [{ email: "outside@example.net" }] } })).toMatchObject({ changed: false });
  expect(updateEvent).not.toHaveBeenCalled(); expect(deleteEvent).not.toHaveBeenCalled(); expect(ctx.audit).not.toHaveBeenCalled();
});
it("passes drive mutations through existing viewer permissions and audits only successful writes", async () => {
  vi.mocked(createFolder).mockResolvedValue({ id, name: "Folder" } as never);
  await call(driveTools, "drive_create_folder", { name: "Folder" });
  expect(createFolder).toHaveBeenCalledWith({ orgId: "org", userId: "me", role: "member" }, { name: "Folder" });
  for (const trashed of [true, false]) {
    vi.mocked(updateItem).mockResolvedValue({ id, name: "Folder" } as never);
    await call(driveTools, "drive_update_item", { id, changes: { trashed } });
    expect(ctx.audit).toHaveBeenLastCalledWith(trashed ? "drive.trash" : "drive.restore", { target: "Folder" });
  }
  vi.mocked(updateItem).mockRejectedValue({ status: 403 });
  vi.mocked(ctx.audit).mockClear();
  await expect(call(driveTools, "drive_update_item", { id, changes: { name: "Private" } })).rejects.toMatchObject({ status: 403 });
  expect(ctx.audit).not.toHaveBeenCalled();
});
it("bounds UTF-8 text writes and propagates quota failures without auditing a write", async () => {
  await expect(call(driveTools, "drive_create_text_file", { name: "big.txt", content: "x".repeat(50001) })).rejects.toThrow();
  expect(putFile).not.toHaveBeenCalled();
  vi.mocked(putFile).mockRejectedValue({ status: 507 });
  await expect(call(driveTools, "drive_create_text_file", { name: "text.txt", content: "żółć" })).rejects.toMatchObject({ status: 507 });
  expect(putFile).toHaveBeenCalledWith(expect.objectContaining({ userId: "me" }), expect.objectContaining({ size: 8, mediaType: "text/plain" }), expect.any(ReadableStream));
  expect(ctx.audit).not.toHaveBeenCalled();
});
