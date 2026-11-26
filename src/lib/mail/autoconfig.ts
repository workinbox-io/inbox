/**
 * Mail app autodiscovery: Thunderbird's autoconfig (clientConfig v1.1, also read by many Android apps) and Outlook's
 * POX autodiscover. Every mailbox signs in with its own address and a device password, so one answer fits all.
 */
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The domain of a plain e-mail address, or null. */
export function emailDomain(email: string | null | undefined) {
  const match = /^[^\s@<>"]{1,64}@([a-z0-9.-]{1,253})$/i.exec((email ?? "").trim());
  return match ? match[1]!.toLowerCase() : null;
}

export function thunderbirdConfig(domain: string, host: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<clientConfig version="1.1">
  <emailProvider id="${esc(domain)}">
    <domain>${esc(domain)}</domain>
    <displayName>Work Inbox</displayName>
    <displayShortName>Work Inbox</displayShortName>
    <incomingServer type="imap">
      <hostname>${esc(host)}</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>${esc(host)}</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
      <authentication>password-cleartext</authentication>
      <username>%EMAILADDRESS%</username>
    </outgoingServer>
  </emailProvider>
</clientConfig>
`;
}

/** The address from an Outlook autodiscover request body (<EMailAddress>). */
export function autodiscoverEmail(body: string) {
  return /<EMailAddress>\s*([^<\s]{3,320})\s*<\/EMailAddress>/i.exec(body)?.[1] ?? null;
}

export function autodiscoverPox(email: string, host: string) {
  const protocol = (type: string, port: number) => `
      <Protocol>
        <Type>${type}</Type>
        <Server>${esc(host)}</Server>
        <Port>${port}</Port>
        <LoginName>${esc(email)}</LoginName>
        <DomainRequired>off</DomainRequired>
        <SPA>off</SPA>
        <SSL>on</SSL>
        <AuthRequired>on</AuthRequired>
      </Protocol>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/responseschema/2006">
  <Response xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a">
    <Account>
      <AccountType>email</AccountType>
      <Action>settings</Action>${protocol("IMAP", 993)}${protocol("SMTP", 465)}
    </Account>
  </Response>
</Autodiscover>
`;
}
