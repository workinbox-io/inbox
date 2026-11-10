import { describe, expect, it } from "vitest";
import {
  baseAddress,
  evaluateDns,
  isValidDomain,
  isValidLocalPart,
  parseAuthResults,
  parseQuery,
  patternMatches,
  planDnsChanges,
  requiredDnsRecords,
  senderVerdict,
  spamScore,
  suggestLocalPart,
} from "../src/lib/mail/rules";

describe("addresses", () => {
  it("validates domains and local parts", () => {
    expect(isValidDomain("acme.com")).toBe(true);
    expect(isValidDomain("mail.acme.co.uk")).toBe(true);
    expect(isValidDomain("acme")).toBe(false);
    expect(isValidDomain("-acme.com")).toBe(false);
    expect(isValidLocalPart("anna.kowalska")).toBe(true);
    expect(isValidLocalPart("anna..k")).toBe(false);
    expect(isValidLocalPart(".anna")).toBe(false);
  });

  it("strips plus addressing", () => {
    expect(baseAddress("Anna+News@Acme.com")).toBe("anna@acme.com");
    expect(baseAddress("anna@acme.com")).toBe("anna@acme.com");
  });

  it("suggests an address from a name", () => {
    expect(suggestLocalPart("Anna Kowalska")).toBe("anna.kowalska");
    expect(suggestLocalPart("Łukasz Żółć")).toBe("lukasz.zolc");
    expect(suggestLocalPart("!!!")).toBe("user");
  });
});

describe("sender rules", () => {
  it("matches addresses and domains", () => {
    expect(patternMatches("@spam.com", "x@spam.com")).toBe(true);
    expect(patternMatches("@spam.com", "x@mail.spam.com")).toBe(true);
    expect(patternMatches("@spam.com", "x@notspam.com")).toBe(false);
    expect(patternMatches("a@b.com", "A@B.com")).toBe(true);
  });

  it("prefers the mailbox's rules, and allow over block", () => {
    const rules = [
      { pattern: "@news.com", action: "block" as const, mailboxId: null },
      { pattern: "boss@news.com", action: "allow" as const, mailboxId: "m1" },
    ];
    expect(senderVerdict(rules, "boss@news.com", "m1")).toBe("allow");
    expect(senderVerdict(rules, "boss@news.com", "m2")).toBe("block");
    expect(senderVerdict(rules, "x@other.com", "m1")).toBeNull();
  });
});

describe("spam", () => {
  it("parses Authentication-Results", () => {
    expect(parseAuthResults("mx.cloudflare.net; dkim=pass header.d=a.com; spf=softfail smtp.mailfrom=a.com; dmarc=fail")).toEqual({
      spf: "softfail",
      dkim: "pass",
      dmarc: "fail",
    });
    expect(parseAuthResults(null)).toEqual({ spf: null, dkim: null, dmarc: null });
  });

  it("scores", () => {
    const clean = spamScore({ auth: { spf: "pass", dkim: "pass", dmarc: "pass" }, headers: {}, subject: "Lunch?", text: "See you", fromEmail: "a@b.com" });
    expect(clean.spam).toBe(false);
    const bad = spamScore({ auth: { spf: "fail", dkim: null, dmarc: "fail" }, headers: {}, subject: "YOU HAVE WON THE LOTTERY", text: "", fromEmail: "a@b.com" });
    expect(bad.spam).toBe(true);
    expect(bad.reasons).toContain("DMARC failed");
  });
});

describe("dns", () => {
  it("lists records and evaluates answers", () => {
    expect(requiredDnsRecords("acme.com").filter((r) => r.type === "MX")).toHaveLength(3);
    expect(evaluateDns({ mx: ["13 route1.mx.cloudflare.net."], txt: ['"v=spf1 include:_spf.mx.cloudflare.net ~all"'], dmarc: [] })).toEqual({
      mx: true,
      spf: true,
      dmarc: false,
      active: true,
    });
    expect(evaluateDns({ mx: ["10 aspmx.l.google.com."], txt: [], dmarc: [] }).active).toBe(false);
  });
  it("lists and checks the SES records of a hosted domain", () => {
    const records = requiredDnsRecords("acme.com", { region: "eu-west-1", tokens: ["a1", "b2", "c3"] });
    expect(records.filter((r) => r.purpose === "dkim").map((r) => [r.name, r.value])).toEqual([
      ["a1._domainkey.acme.com", "a1.dkim.amazonses.com"],
      ["b2._domainkey.acme.com", "b2.dkim.amazonses.com"],
      ["c3._domainkey.acme.com", "c3.dkim.amazonses.com"],
    ]);
    expect(records.find((r) => r.purpose === "mx")).toMatchObject({ value: "inbound-smtp.eu-west-1.amazonaws.com", priority: 10 });
    expect(records.filter((r) => r.purpose === "mailfrom").map((r) => r.name)).toEqual(["bounce.acme.com", "bounce.acme.com"]);
    expect(evaluateDns({ mx: ["10 inbound-smtp.eu-west-1.amazonaws.com."], txt: [], dmarc: ['"v=DMARC1; p=none"'] }, "eu-west-1")).toEqual({ mx: true, spf: false, dmarc: true, active: true });
    expect(evaluateDns({ mx: ["10 inbound-smtp.eu-central-1.amazonaws.com."], txt: [], dmarc: [] }, "eu-west-1").active).toBe(false);
    expect(evaluateDns({ mx: ["13 route1.mx.cloudflare.net."], txt: [], dmarc: [] }, "eu-west-1").active).toBe(false);
  });
});

describe("connect Cloudflare", () => {
  it("plans the missing records and the competing MX", () => {
    const required = requiredDnsRecords("acme.com", { region: "eu-west-1", tokens: ["a1"] });
    const existing = [
      { id: "1", type: "MX", name: "acme.com", content: "aspmx.l.google.com", priority: 1 },
      { id: "2", type: "CNAME", name: "a1._domainkey.acme.com", content: "a1.dkim.amazonses.com." },
      { id: "3", type: "TXT", name: "_dmarc.acme.com", content: '"v=DMARC1; p=none"' },
      { id: "4", type: "MX", name: "bounce.acme.com", content: "feedback-smtp.eu-west-1.amazonses.com", priority: 10 },
    ];
    const plan = planDnsChanges(existing, required);
    expect(plan.create.map((r) => `${r.type} ${r.name}`)).toEqual(["MX acme.com", "TXT bounce.acme.com"]);
    expect(plan.conflicts.map((r) => r.id)).toEqual(["1"]);
    expect(planDnsChanges([...existing, { id: "5", type: "MX", name: "acme.com", content: "inbound-smtp.eu-west-1.amazonaws.com" }, { id: "6", type: "TXT", name: "bounce.acme.com", content: '"v=spf1 include:amazonses.com ~all"' }], required).create).toEqual([]);
  });
});

describe("search", () => {
  it("parses operators", () => {
    expect(parseQuery('from:anna subject:"q3 plan" has:attachment is:unread budget')).toEqual({
      labels: [],
      text: ["budget"],
      from: ["anna"],
      to: [],
      subject: ["q3 plan"],
      hasAttachment: true,
      unread: true,
      starred: false,
    });
  });
});
