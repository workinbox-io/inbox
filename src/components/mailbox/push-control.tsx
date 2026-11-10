import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { toast } from "@yusufceng1z/ding-react";

async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/app/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Turns push notifications for new mail on or off on this device. `stateful` checks whether this device is
 * subscribed and labels the button "Turn on" / "Turn off" (settings); without it it's one "Device notifications" toggle.
 */
export function PushControl({ variant = "ghost", stateful = false }: { variant?: "ghost" | "outline"; stateful?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (stateful) void currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false));
  }, [stateful]);
  const label = !stateful ? "Device notifications" : on === null ? "Checking…" : on ? "Turn off" : "Turn on";
  return <Button size="sm" variant={stateful && on === false ? "default" : variant} disabled={busy || (stateful && on === null)} onClick={async () => {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
      const registration = await navigator.serviceWorker.register("/mail-sw.js", { scope: "/app/" });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await api("DELETE", "/api/app/mail/push", { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setOn(false);
        toast.success("Notifications disabled on this device");
      } else {
        const { publicKey } = await api<{ publicKey: string | null }>("GET", "/api/app/mail/push");
        if (!publicKey) throw new Error("Notifications have not been configured by your administrator.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notifications were not allowed.");
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await api("POST", "/api/app/mail/push", subscription.toJSON());
        setOn(true);
        toast.success("Notifications enabled on this device");
      }
    } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }}>{label}</Button>;
}
