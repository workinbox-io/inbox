import { navigatePanel } from "@/lib/panel-history"
import * as React from "react";
import { Bell, BellOff, MessagesSquare } from "lucide-react";
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

type MailItem = { id: string; threadId: string; createdAt: number; readAt: number | null; subject: string | null; sender: string; senderName: string | null; preview: string | null };
type ChatItem = { id: string; createdAt: number; read: boolean; sender: string; senderName: string; title: string; preview: string; href: string };
/** Mail and chat in one list (chat: mentions and direct messages, read once the conversation is seen). */
type Item = { key: string; kind: "mail" | "chat"; id: string; href: string; createdAt: number; unread: boolean; sender: string; senderName: string | null; title: string; preview: string };
type Result = { notifications: Item[]; unread: number };

async function load(): Promise<Result> {
  const [mail, chat] = await Promise.all([
    api<{ notifications: MailItem[]; unread: number }>("GET", "/api/app/mail/notifications"),
    // Chat never keeps mail's notifications from showing.
    api<{ notifications: ChatItem[]; unread: number }>("GET", "/api/app/chat/notifications").catch(() => ({ notifications: [], unread: 0 })),
  ]);
  const items: Item[] = [
    ...mail.notifications.map((n) => ({ key: `mail:${n.id}`, kind: "mail" as const, id: n.id, href: `/app/mail?t=${encodeURIComponent(n.threadId)}`, createdAt: n.createdAt, unread: !n.readAt, sender: n.sender, senderName: n.senderName, title: n.subject || "(No subject)", preview: snippet(n.preview) })),
    ...chat.notifications.map((n) => ({ key: `chat:${n.id}`, kind: "chat" as const, id: n.id, href: n.href, createdAt: n.createdAt, unread: !n.read, sender: n.sender, senderName: n.senderName, title: n.title, preview: n.preview.replace(/\s+/g, " ").trim() })),
  ].sort((a, b) => b.createdAt - a.createdAt);
  return { notifications: items, unread: mail.unread + chat.unread };
}

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

export function NotificationCenter({ side = "bottom" }: { side?: "bottom" | "right" }) {
  const [opened, setOpened] = React.useState(false);
  const [data, setData] = React.useState<Result | null>(null);
  const [error, setError] = React.useState(false);
  const refresh = React.useCallback(async () => {
    try { setData(await load()); setError(false); }
    catch { setError(true); }
  }, []);
  React.useEffect(() => { void refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer); }, [refresh]);
  async function open(item: Item) {
    // Chat items are read by opening the conversation.
    try { if (item.kind === "mail") await api("PATCH", "/api/app/mail/notifications", { id: item.id }); setOpened(false); navigatePanel(item.href); }
    catch { setError(true); }
  }
  return <Popover open={opened} onOpenChange={open => { setOpened(open); if (open) void refresh(); }}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon" title="Notifications" aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`} className="relative"><Bell className="size-4" />{Boolean(data?.unread) && <span className="bg-primary absolute right-1 top-1 size-2 rounded-full" />}</Button></PopoverTrigger>
    <PopoverPrimitive.Portal><PopoverPrimitive.Content side={side} align="end" sideOffset={6} className="bg-popover text-popover-foreground z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border shadow-lg">
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
        {data && !data.notifications.length && <EmptyState variant="plain" density="compact" icon={<BellOff />} title="All caught up" description="New mail, chat mentions and direct messages show up here." />}
        {data?.notifications.map(item => {
          const { unread, preview } = item;
          return <button key={item.key} onClick={() => void open(item)} className="hover:bg-muted focus-visible:bg-muted flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors">
            <span className="relative mt-0.5 shrink-0"><UserAvatar seed={item.sender || item.id} size={32} />{item.kind === "chat" && <MessagesSquare className="bg-popover text-muted-foreground absolute -right-1 -bottom-1 size-4 rounded-full p-0.5" aria-label="Chat" />}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-sm leading-snug", unread ? "font-semibold" : "font-medium text-muted-foreground")} title={item.sender}>{item.senderName || item.sender}</span>
                <time className="text-muted-foreground shrink-0 text-xs tabular-nums" dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{ago(item.createdAt)}</time>
                {unread && <span className="bg-primary size-1.5 shrink-0 self-center rounded-full" aria-label="Unread" />}
              </span>
              <span className={cn("truncate text-[13px] leading-snug", unread ? "text-foreground font-medium" : "text-muted-foreground")}>{item.title}</span>
              {preview && <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{preview}</span>}
            </span>
          </button>;
        })}
      </div>
    </PopoverPrimitive.Content></PopoverPrimitive.Portal>
  </Popover>;
}
