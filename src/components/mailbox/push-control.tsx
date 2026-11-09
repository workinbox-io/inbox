import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
export function PushControl({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant={variant} disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported on this device.");
      const registration = await navigator.serviceWorker.register("/mail-sw.js", { scope: "/app/" });
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await api("DELETE", "/api/app/mail/push", { endpoint: existing.endpoint });
        await existing.unsubscribe();
        toast.success("Notifications disabled on this device");
      } else {
        const { publicKey } = await api<{ publicKey: string | null }>("GET", "/api/app/mail/push");
        if (!publicKey) throw new Error("Notifications have not been configured by your administrator.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notifications were not allowed.");
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await api("POST", "/api/app/mail/push", subscription.toJSON());
        toast.success("Notifications enabled on this device");
      }
    } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }}>Device notifications</Button>;
}
