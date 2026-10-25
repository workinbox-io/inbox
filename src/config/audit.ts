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
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** How long entries are kept (the daily cron deletes older ones). */
export const AUDIT_RETENTION_DAYS = 365;
