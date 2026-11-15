import { CalendarDays, Contact, HardDrive, Mail, MessagesSquare, NotebookPen, type LucideIcon } from "lucide-react";

/** The workspace's apps, each with its marketing page (pages/<slug>.astro), in the order the site shows them. */
export type AppInfo = { slug: string; label: string; description: string; icon: LucideIcon; shot: string };

export const APPS: AppInfo[] = [
  { slug: "custom-domain-email", label: "Mail", description: "Mailboxes on your domain, shared ones like support@, aliases.", icon: Mail, shot: "mail-thread" },
  { slug: "team-chat", label: "Chat", description: "Channels, direct messages and threads for the team.", icon: MessagesSquare, shot: "chat" },
  { slug: "shared-notes", label: "Notes", description: "Notes the team writes together, live.", icon: NotebookPen, shot: "notes" },
  { slug: "team-calendar", label: "Calendar", description: "Personal and shared calendars, invitations, time zones.", icon: CalendarDays, shot: "calendar" },
  { slug: "shared-drive", label: "Drive", description: "Folders and files shared with people or the team.", icon: HardDrive, shot: "drive" },
  { slug: "shared-contacts", label: "Contacts", description: "One address book for the team, filled from your mail.", icon: Contact, shot: "contacts" },
];
