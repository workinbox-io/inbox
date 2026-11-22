// Deliberately no fetch handler or private response cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data.json(); } catch {}
  if (data.kind === "event") return event.waitUntil(eventReminder(data));
  if (data.kind === "chat") return event.waitUntil(chatMessage(data));
  const url = typeof data.url === "string" && data.url.startsWith("/app/mail?") ? data.url : "/app/mail";
  event.waitUntil((async () => {
    // Recheck the current browser session and mailbox access at display time.
    try {
      const query = new URLSearchParams({ threadId: data.threadId || "", userId: data.userId || "" });
      const response = await fetch("/api/app/mail/push?" + query, { credentials: "include", cache: "no-store" });
      if (!response.ok || !(await response.json()).allowed) return;
      await self.registration.showNotification("New mail", { body: "Open Work Inbox to read your message.", icon: "/mail-icon-192.png", tag: "workinbox-mail", data: { url } });
    } catch {}
  })());
});
// Calendar reminders carry only ids; the title is read with the current session, so a signed-out or removed person sees nothing.
async function eventReminder(data) {
  try {
    const response = await fetch("/api/app/calendar/events/" + encodeURIComponent(data.eventId || ""), { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const ev = await response.json();
    const minutes = Number(data.minutes) || 0;
    const when = minutes ? "in " + minutes + " min" : "now";
    await self.registration.showNotification((ev.title || "Event") + " " + when, {
      body: ev.location || "",
      icon: "/mail-icon-192.png",
      tag: "workinbox-event-" + data.eventId + "-" + data.occurrence,
      data: { url: "/app/calendar?event=" + encodeURIComponent(data.eventId || "") },
    });
  } catch {}
}
// Chat pushes carry only ids; who wrote what is read with the current session.
async function chatMessage(data) {
  try {
    const query = new URLSearchParams({ id: data.messageId || "", userId: data.userId || "" });
    const response = await fetch("/api/app/chat/push?" + query, { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const preview = await response.json();
    const url = typeof preview.url === "string" && preview.url.startsWith("/app/chat/") ? preview.url : "/app/chat";
    await self.registration.showNotification(preview.title || "New message", { body: preview.body || "", icon: "/mail-icon-192.png", tag: "workinbox-chat-" + data.messageId, data: { url } });
  } catch {}
}
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/app/mail"));
});
