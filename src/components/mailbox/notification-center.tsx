import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { UserAvatar } from "@/components/app/user-avatar";
import { api } from "@/lib/api-client";
import { splitQuotedReply } from "@/lib/mail/quotes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover as PopoverPrimitive } from "radix-ui";
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
import { PushControl } from "./push-control";

type Item = { id: string; threadId: string; createdAt: number; readAt: number | null; subject: string | null; sender: string; senderName: string | null; preview: string | null };
type Result = { notifications: Item[]; unread: number };

/** "now", "5m", "3h", then the date. */
function ago(ms: number) {
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h`;
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
}

const snippet = (text: string | null) => (text ? splitQuotedReply(text).body.replace(/\s+/g, " ").trim() : "");

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
    <PopoverPrimitive.Portal><PopoverPrimitive.Content align="end" sideOffset={6} className="bg-popover text-popover-foreground z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-lg">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          Notifications
          {data?.unread ? <span className="bg-primary text-primary-foreground grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-medium tabular-nums">{data.unread}</span> : null}
        </span>
        <PushControl />
      </div>
      <div className="max-h-[26rem] overflow-y-auto px-1.5 pb-1.5">
        {error && <p role="alert" className="text-destructive px-2.5 py-3 text-sm">Could not load notifications. <button className="underline" onClick={refresh}>Retry</button></p>}
        {!data && !error && <p className="text-muted-foreground px-2.5 py-3 text-sm">Loading…</p>}
        {data && !data.notifications.length && <EmptyState variant="plain" density="compact" icon={<BellOff />} title="All caught up" description="New mail in your mailboxes shows up here." />}
        {data?.notifications.map(item => {
          const unread = !item.readAt;
          const preview = snippet(item.preview);
          return <button key={item.id} onClick={() => void open(item)} className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors">
            <UserAvatar seed={item.sender} size={32} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-sm leading-snug", unread ? "font-semibold" : "font-medium text-muted-foreground")} title={item.sender}>{item.senderName || item.sender}</span>
                <time className="text-muted-foreground shrink-0 text-xs tabular-nums" dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{ago(item.createdAt)}</time>
                {unread && <span className="bg-primary size-1.5 shrink-0 self-center rounded-full" aria-label="Unread" />}
              </span>
              <span className={cn("truncate text-[13px] leading-snug", unread ? "text-foreground font-medium" : "text-muted-foreground")}>{item.subject || "(No subject)"}</span>
              {preview && <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{preview}</span>}
            </span>
          </button>;
        })}
      </div>
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </Popover>;
}
