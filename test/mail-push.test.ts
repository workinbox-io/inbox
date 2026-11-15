import { describe, expect, it } from "vitest";
import { validPushEndpoint } from "@/lib/mail/push-policy";
describe("push endpoint boundary", () => {
  it("accepts supported browser push services", () => {
    for (const endpoint of ["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns2.notify.windows.com/token"]) expect(validPushEndpoint(endpoint)).toBe(true);
  });
  it("rejects non-HTTPS, internal URLs, credentials, ports and hostname spoofing", () => {
    for (const endpoint of ["http://fcm.googleapis.com/token", "https://localhost/token", "https://127.0.0.1/", "https://fcm.googleapis.com.attacker.test/", "https://fcm.googleapis.com@attacker.test/", "https://user:secret@fcm.googleapis.com/", "https://fcm.googleapis.com:8443/", "not a URL"]) expect(validPushEndpoint(endpoint)).toBe(false);
  });
});
