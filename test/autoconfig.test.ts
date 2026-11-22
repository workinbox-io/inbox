import { describe, expect, it } from "vitest";
import { autodiscoverEmail, autodiscoverPox, emailDomain, thunderbirdConfig } from "../src/lib/mail/autoconfig";

describe("autoconfig", () => {
  it("reads the domain from a plain address only", () => {
    expect(emailDomain("Anna@Acme.Test")).toBe("acme.test");
    expect(emailDomain("not an address")).toBeNull();
    expect(emailDomain("a@b@c.test")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });

  it("answers Thunderbird with IMAP 993 and SMTP 465 over SSL, logging in with the address", () => {
    const xml = thunderbirdConfig("acme.test", "mail.workinbox.io");
    expect(xml).toContain("<domain>acme.test</domain>");
    expect(xml).toContain("<port>993</port>");
    expect(xml).toContain("<port>465</port>");
    expect(xml.match(/%EMAILADDRESS%/g)).toHaveLength(2);
  });

  it("parses an Outlook request and answers with escaped settings", () => {
    const body = `<Autodiscover><Request><EMailAddress> anna@acme.test </EMailAddress></Request></Autodiscover>`;
    expect(autodiscoverEmail(body)).toBe("anna@acme.test");
    expect(autodiscoverEmail("<x/>")).toBeNull();
    const xml = autodiscoverPox("a&b@acme.test", "mail.workinbox.io");
    expect(xml).toContain("<LoginName>a&amp;b@acme.test</LoginName>");
    expect(xml).toContain("<Type>SMTP</Type>");
  });
});
