import * as React from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Popover as PopoverPrimitive } from "radix-ui";
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
import { PushControl } from "./push-control";

type Item = { id: string; threadId: string; createdAt: number; readAt: number | null; subject: string | null; sender: string };
type Result = { notifications: Item[]; unread: number };
export function NotificationCenter() {
  const [data, setData] = React.useState<Result | null>(null);
  const [error, setError] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try { setData(await api<Result>("GET", "/api/app/mail/notifications")); setError(false); }
    catch { setError(true); }
  }, []);
  React.useEffect(() => { void refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer); }, [refresh]);
  async function open(item: Item) {
    try { await api("PATCH", "/api/app/mail/notifications", { id: item.id }); location.href = `/app/mail?t=${encodeURIComponent(item.threadId)}`; }
    catch { setError(true); }
  }
  return <Popover onOpenChange={open => { if (open) void refresh(); }}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`} className="relative"><Bell className="size-4" />{Boolean(data?.unread) && <span className="bg-primary absolute right-1 top-1 size-2 rounded-full" />}</Button></PopoverTrigger>
    <PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={4} className="bg-popover text-popover-foreground z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border shadow-md">
      <div className="flex items-center justify-between border-b p-3"><span className="font-medium">Notifications{data?.unread ? ` (${data.unread})` : ""}</span><PushControl /></div>
      <div className="max-h-80 overflow-y-auto">{error && <p role="alert" className="text-destructive p-3 text-sm">Could not load notifications. <button className="underline" onClick={refresh}>Retry</button></p>}{!data && !error && <p className="text-muted-foreground p-3 text-sm">Loading…</p>}{data && !data.notifications.length && <p className="text-muted-foreground p-3 text-sm">No notifications yet.</p>}{data?.notifications.map(item => <button key={item.id} onClick={() => void open(item)} className="hover:bg-muted flex w-full flex-col gap-1 border-b p-3 text-left text-sm"><span className={item.readAt ? "text-muted-foreground" : "font-semibold"}>{item.sender}</span><span className="truncate">{item.subject || "(No subject)"}</span><time className="text-muted-foreground text-xs">{new Date(item.createdAt).toLocaleString()}</time></button>)}</div>
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </Popover>;
}
