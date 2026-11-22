import { describe, expect, it } from "vitest";
import { mobileconfig } from "../src/lib/mail/mobileconfig";

describe("mobileconfig", () => {
  const account = { address: "anna@acme.test", name: "Anna <& Co>", username: "anna@acme.test", password: "tag1234567.s&cret", host: "mail.workinbox.io", imapPort: 993 };
  let n = 0;
  const uuid = () => `UUID-${++n}`;

  it("adds one IMAP + SMTP account per mailbox with escaped values", () => {
    const xml = mobileconfig({ device: "iPhone", accounts: [{ ...account, smtp: { host: "mail.workinbox.io", port: 465 } }, { ...account, address: "team@acme.test", smtp: null }], uuid });
    expect(xml.match(/com\.apple\.mail\.managed/g)).toHaveLength(2);
    expect(xml).toContain("<key>IncomingPassword</key><string>tag1234567.s&amp;cret</string>");
    expect(xml).toContain("<key>EmailAccountName</key><string>Anna &lt;&amp; Co&gt;</string>");
    expect(xml).toContain("<key>IncomingMailServerPortNumber</key><integer>993</integer>");
    expect(xml).toContain("<key>OutgoingMailServerPortNumber</key><integer>465</integer>");
    expect(xml).toContain("<key>IncomingMailServerUseSSL</key><true/>");
    expect(xml).toContain("io.workinbox.mail.account.team@acme.test");
    expect(xml).toContain("<key>PayloadType</key><string>Configuration</string>");
  });
});
