import { describe, expect, it } from "vitest";
import { splitQuotedReply } from "../src/lib/mail/quotes";
import {
  forwardSubject,
  forwardText,
  hasQuotedHtml,
  hasRemoteImages,
  linkSegments,
  mailSrcDoc,
  replyRecipients,
  snoozePresets,
  withSignature,
} from "../src/lib/admin-mail/rules";

const ours = ["plugins@luxivo.app", "support@luxivo.app"];

describe("replyRecipients", () => {
  const incoming = { direction: "in" as const, fromEmail: "noreply@wordpress.org", to: "plugins@luxivo.app, team@wp.org", cc: "Anna@wp.org, support@luxivo.app" };

  it("replies to the contact (Reply-To), not the noreply sender", () => {
    expect(replyRecipients(incoming, "review@wordpress.org", ours, false)).toEqual({ to: ["review@wordpress.org"], cc: [] });
  });

  it("reply all copies everyone else, never our mailboxes or the sender's noreply", () => {
    expect(replyRecipients(incoming, "review@wordpress.org", ours, true)).toEqual({ to: ["review@wordpress.org"], cc: ["team@wp.org", "anna@wp.org"] });
  });

  it("replying to our own message goes to its first recipient", () => {
    const sent = { direction: "out" as const, fromEmail: "plugins@luxivo.app", to: "a@x.com", cc: "b@x.com" };
    expect(replyRecipients(sent, "a@x.com", ours, true)).toEqual({ to: ["a@x.com"], cc: ["b@x.com"] });
  });
});

describe("forwarding", () => {
  it("prefixes the subject once", () => {
    expect(forwardSubject("Review")).toBe("Fwd: Review");
    expect(forwardSubject("FWD: Review")).toBe("FWD: Review");
    expect(forwardSubject("")).toBe("Fwd: (no subject)");
  });

  it("writes the forwarded header block", () => {
    const text = forwardText(
      { fromEmail: "a@x.com", fromName: "Ann", to: "plugins@luxivo.app", cc: "", subject: "Hi", text: "Body\n", createdAt: new Date(0) },
      () => "DATE",
    );
    expect(text).toBe("---------- Forwarded message ----------\nFrom: Ann <a@x.com>\nDate: DATE\nSubject: Hi\nTo: plugins@luxivo.app\n\nBody");
  });
});

describe("withSignature", () => {
  it("adds the standard separator, and nothing for an empty signature", () => {
    expect(withSignature("", "Kuba\nLuxivo")).toBe("\n\n-- \nKuba\nLuxivo");
    expect(withSignature("Hi", "  ")).toBe("Hi");
  });
});

describe("snoozePresets", () => {
  it("offers later today in the morning, tomorrow at 8, the weekend and next Monday", () => {
    const wed = new Date(2026, 9, 28, 10, 15); // Wednesday
    const p = Object.fromEntries(snoozePresets(wed).map((x) => [x.id, x.at]));
    expect(p.later).toEqual(new Date(2026, 9, 28, 13, 0));
    expect(p.tomorrow).toEqual(new Date(2026, 9, 29, 8, 0));
    expect(p.weekend).toEqual(new Date(2026, 9, 31, 8, 0));
    expect(p.week).toEqual(new Date(2026, 10, 2, 8, 0));
  });

  it("drops later today in the evening and moves the weekend on a Saturday", () => {
    const sat = new Date(2026, 9, 31, 20, 0);
    const p = Object.fromEntries(snoozePresets(sat).map((x) => [x.id, x.at]));
    expect(p.later).toBeUndefined();
    expect(p.weekend).toEqual(new Date(2026, 10, 7, 8, 0));
    expect(p.week).toEqual(new Date(2026, 10, 2, 8, 0));
  });
});

describe("splitQuotedReply", () => {
  it("folds the history under the new text", () => {
    expect(splitQuotedReply("Thanks!\n\nOn Mon, 1 Jan 2026, Ann <a@x.com> wrote:\n> hi")).toEqual({ body: "Thanks!", quoted: "On Mon, 1 Jan 2026, Ann <a@x.com> wrote:\n> hi" });
  });

  it("keeps a mail that starts with a quote whole", () => {
    expect(splitQuotedReply("> quoted only").quoted).toBe("");
  });
});

describe("incoming HTML", () => {
  it("spots remote images and quoted history", () => {
    expect(hasRemoteImages('<img src="https://t.co/p.gif">')).toBe(true);
    expect(hasRemoteImages('<img src="/api/files/attachments/admin-mail/x/a.png">')).toBe(false);
    expect(hasQuotedHtml('<div class="gmail_quote">')).toBe(true);
  });

  it("blocks scripts and, until allowed, remote images", () => {
    const doc = mailSrcDoc("<p>x</p>", { origin: "https://luxivo.app", remoteImages: false, showQuoted: false });
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data: cid: https://luxivo.app;");
    expect(doc).toContain(".gmail_quote");
    expect(mailSrcDoc("", { origin: "o", remoteImages: true, showQuoted: true })).toContain("img-src data: cid: o https: http:");
  });
});

describe("linkSegments", () => {
  it("splits out URLs without trailing punctuation", () => {
    expect(linkSegments("See https://wp.org/plugins/x. Thanks")).toEqual([{ text: "See " }, { text: "https://wp.org/plugins/x", href: "https://wp.org/plugins/x" }, { text: ". Thanks" }]);
  });
});
