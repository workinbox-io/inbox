import { describe, expect, it } from "vitest";
import { parseContactsFile, parseCsv, toCsv, toVcards } from "../src/lib/contacts/import";
import { cleanContact, mergeContact, worthRecording } from "../src/lib/contacts/rules";

describe("contacts import", () => {
  it("reads a Google Contacts CSV", () => {
    const csv = [
      "First Name,Middle Name,Last Name,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value,Organization Name,Organization Title",
      'Anna,,Kowalska,"Met at, the fair",* myContacts ::: Clients,* Work,anna@acme.com ::: a.k@acme.com,Home,ANNA@home.pl,Mobile,+48 600 100 200,Acme,CEO',
    ].join("\n");
    const [c] = parseContactsFile(csv);
    expect(c).toEqual({
      name: "Anna Kowalska",
      company: "Acme",
      title: "CEO",
      note: "Met at, the fair",
      emails: [
        { value: "anna@acme.com", label: "work" },
        { value: "a.k@acme.com", label: "work" },
        { value: "anna@home.pl", label: "home" },
      ],
      phones: [{ value: "+48 600 100 200", label: "mobile" }],
      groups: ["Clients"],
    });
  });

  it("reads an Outlook CSV", () => {
    const csv = "First Name,Last Name,E-mail Address,E-mail 2 Address,Mobile Phone,Business Phone,Company,Job Title,Categories\r\nJan,Nowak,jan@firma.pl,,123,456,Firma,Dev,VIP;Partners\r\n";
    const [c] = parseContactsFile(csv);
    expect(c!.name).toBe("Jan Nowak");
    expect(c!.emails).toEqual([{ value: "jan@firma.pl" }]);
    expect(c!.phones).toEqual([
      { value: "123", label: "mobile" },
      { value: "456", label: "business" },
    ]);
    expect(c!.groups).toEqual(["VIP", "Partners"]);
  });

  it("reads a plain sheet and skips empty rows", () => {
    expect(parseContactsFile("email,name\nbob@x.io,Bob\n,\nnot-an-email,\n")).toEqual([
      { name: "Bob", company: "", title: "", note: "", emails: [{ value: "bob@x.io" }], phones: [], groups: [] },
    ]);
  });

  it("parses quoted CSV with line breaks", () => {
    expect(parseCsv('a,"b ""c""\nd",e\n1,2,3')).toEqual([["a", 'b "c"\nd', "e"], ["1", "2", "3"]]);
  });

  it("reads vCard 3 and 4 with folded lines", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:4.0",
      "N:Kowalska;Anna;;;",
      "EMAIL;TYPE=work:anna@acme.com",
      "item1.EMAIL;type=INTERNET;type=HOME:anna@home.pl",
      "TEL;TYPE=cell:+48 600",
      "NOTE:Line one\\nline two that is very long and is folded by the",
      "  exporter",
      "ORG:Acme\\, Inc.;Sales",
      "CATEGORIES:Clients,VIP",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Bob",
      "EMAIL;INTERNET:bob@x.io",
      "END:VCARD",
    ].join("\r\n");
    const [a, b] = parseContactsFile(vcf);
    expect(a).toEqual({
      name: "Anna Kowalska",
      company: "Acme, Inc.",
      title: "",
      note: "Line one\nline two that is very long and is folded by the exporter",
      emails: [
        { value: "anna@acme.com", label: "work" },
        { value: "anna@home.pl", label: "home" },
      ],
      phones: [{ value: "+48 600", label: "mobile" }],
      groups: ["Clients", "VIP"],
    });
    expect(b!.name).toBe("Bob");
    expect(b!.emails).toEqual([{ value: "bob@x.io" }]);
  });

  it("round-trips its own exports", () => {
    const list = [
      cleanContact({ name: "Anna Maria Kowalska", company: "Acme; Inc", note: 'Says "hi",\nbye', emails: [{ value: "anna@acme.com", label: "work" }, { value: "a@b.co" }], phones: [{ value: "+1 555", label: "mobile" }], groups: ["Clients", "A,B"] }),
      cleanContact({ name: "", emails: [{ value: "solo@x.io" }] }),
    ];
    expect(parseContactsFile(toVcards(list))).toEqual(list.map((c) => ({ ...c, name: c.name || "solo@x.io" })));
    expect(parseContactsFile(toCsv(list))).toEqual(list);
  });
});

describe("contacts rules", () => {
  it("cleans addresses and phones", () => {
    const c = cleanContact({ name: "  Ann ", emails: [{ value: " ANN@X.IO " }, { value: "ann@x.io" }, { value: "nope" }], phones: [{ value: " 1 " }, { value: "1" }, { value: "" }] });
    expect(c.name).toBe("Ann");
    expect(c.emails).toEqual([{ value: "ann@x.io" }]);
    expect(c.phones).toEqual([{ value: "1" }]);
  });

  it("skips own domains and machines", () => {
    expect(worthRecording("ann@client.com", ["acme.com"])).toBe(true);
    expect(worthRecording("bob@acme.com", ["acme.com"])).toBe(false);
    expect(worthRecording("noreply@client.com", [])).toBe(false);
    expect(worthRecording("no-reply+x@client.com", [])).toBe(false);
    expect(worthRecording("norbert@client.com", [])).toBe(true);
  });

  it("merges without losing anything", () => {
    const a = cleanContact({ name: "Ann", emails: [{ value: "ann@x.io" }], groups: ["A"] });
    const b = cleanContact({ name: "Annie", company: "X", emails: [{ value: "ann@x.io" }, { value: "ann@y.io" }], phones: [{ value: "1" }], groups: ["B"] });
    expect(mergeContact(a, b)).toEqual({ name: "Ann", company: "X", title: "", note: "", emails: [{ value: "ann@x.io" }, { value: "ann@y.io" }], phones: [{ value: "1" }], groups: ["A", "B"] });
  });
});
