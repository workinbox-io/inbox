// Deliberately no fetch handler or private response cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data.json(); } catch {}
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
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/app/mail"));
});
