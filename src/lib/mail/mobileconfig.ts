/** Apple configuration profile (.mobileconfig) that adds IMAP/SMTP accounts to Mail on iPhone, iPad and Mac. */
export interface ProfileAccount {
  address: string;
  name: string;
  username: string;
  password: string;
  host: string;
  imapPort: number;
  smtp: { host: string; port: number } | null;
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const entry = (key: string, value: string | number | boolean) =>
  `<key>${key}</key>${typeof value === "boolean" ? `<${value}/>` : typeof value === "number" ? `<integer>${value}</integer>` : `<string>${esc(value)}</string>`}`;
const dict = (values: Record<string, string | number | boolean>) => `<dict>${Object.entries(values).map(([k, v]) => entry(k, v)).join("")}</dict>`;

export function mobileconfig({ device, accounts, uuid = () => crypto.randomUUID().toUpperCase() }: { device: string; accounts: ProfileAccount[]; uuid?: () => string }) {
  const payloads = accounts.map((a) => {
    // shortcut: a domain without SMTP still gets the outgoing server (Apple requires one); sending there is refused.
    const out = a.smtp ?? { host: a.host, port: 465 };
    return dict({
      EmailAccountDescription: a.address,
      EmailAccountName: a.name,
      EmailAccountType: "EmailTypeIMAP",
      EmailAddress: a.address,
      IncomingMailServerAuthentication: "EmailAuthPassword",
      IncomingMailServerHostName: a.host,
      IncomingMailServerPortNumber: a.imapPort,
      IncomingMailServerUseSSL: true,
      IncomingMailServerUsername: a.username,
      IncomingPassword: a.password,
      OutgoingMailServerAuthentication: "EmailAuthPassword",
      OutgoingMailServerHostName: out.host,
      OutgoingMailServerPortNumber: out.port,
      OutgoingMailServerUseSSL: true,
      OutgoingMailServerUsername: a.username,
      OutgoingPassword: a.password,
      PayloadDisplayName: a.address,
      PayloadIdentifier: `io.workinbox.mail.account.${a.address.toLowerCase()}`,
      PayloadType: "com.apple.mail.managed",
      PayloadUUID: uuid(),
      PayloadVersion: 1,
    });
  });
  const id = uuid();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>PayloadContent</key><array>${payloads.join("")}</array>${[
    entry("PayloadDescription", accounts.map((a) => a.address).join(", ")),
    entry("PayloadDisplayName", `Work Inbox · ${device}`),
    entry("PayloadIdentifier", `io.workinbox.mail.${id}`),
    entry("PayloadOrganization", "Work Inbox"),
    entry("PayloadRemovalDisallowed", false),
    entry("PayloadType", "Configuration"),
    entry("PayloadUUID", id),
    entry("PayloadVersion", 1),
  ].join("")}</dict></plist>
`;
}
