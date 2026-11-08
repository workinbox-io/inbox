/** Every action the audit log records, with the label the dashboard shows. Add your product's here. */
export const AUDIT_ACTIONS = {
  "project.create": "Created project",
  "project.update": "Changed project",
  "project.delete": "Deleted project",
  "api_key.create": "Created API key",
  "api_key.revoke": "Revoked API key",
  "member.invite": "Invited member",
  "member.invite_cancel": "Cancelled invitation",
  "member.join": "Joined organization",
  "member.remove": "Removed member",
  "member.role": "Changed member role",
  "member.leave": "Left organization",
  "org.rename": "Renamed organization",
  "org.billing_details": "Changed company details",
  "org.transfer": "Transferred ownership",
  "org.delete": "Deleted organization",
  "mail_domain.add": "Added mail domain",
  "mail_domain.remove": "Removed mail domain",
  "mail_domain.catch_all": "Changed catch-all mailbox",
  "mail_person.add": "Added a person with a mailbox",
  "mail_person.reset_password": "Reset a mail password",
  "mailbox.create": "Created mailbox",
  "mailbox.update": "Changed mailbox",
  "mailbox.delete": "Deleted mailbox",
  "mailbox.access": "Changed mailbox access",
  "mail_alias.add": "Added alias",
  "mail_alias.remove": "Removed alias",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** How long entries are kept (the daily cron deletes older ones). */
export const AUDIT_RETENTION_DAYS = 365;
