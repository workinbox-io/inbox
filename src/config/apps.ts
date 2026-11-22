import { CalendarDays, Contact, Database, HardDrive, Mail, MessagesSquare, NotebookPen, type LucideIcon } from "lucide-react";
import { msg } from "@/lib/i18n/panel";

/** The workspace's apps, each with its marketing page (pages/<slug>.astro), in the order the site shows them. */
export type AppInfo = { slug: string; label: string; description: string; icon: LucideIcon; shot: string };

export const APPS: AppInfo[] = [
  { slug: "custom-domain-email", label: msg("Mail"), description: "Mailboxes on your domain, shared ones like support@, aliases.", icon: Mail, shot: "mail-thread" },
  { slug: "team-chat", label: msg("Chat"), description: "Channels, direct messages and threads for the team.", icon: MessagesSquare, shot: "chat" },
  { slug: "shared-notes", label: msg("Notes"), description: "Notes the team writes together, live.", icon: NotebookPen, shot: "notes" },
  { slug: "team-calendar", label: msg("Calendar"), description: "Personal and shared calendars, invitations, time zones.", icon: CalendarDays, shot: "calendar" },
  { slug: "shared-drive", label: msg("Drive"), description: "Folders and files shared with people or the team.", icon: HardDrive, shot: "drive" },
  { slug: "shared-contacts", label: msg("Contacts"), description: "One address book for the team, filled from your mail.", icon: Contact, shot: "contacts" },
  { slug: "custom-apps", label: msg("Collections"), description: "Your own lists: equipment, inventory, deals, tasks, as a list, table, board, timeline or calendar.", icon: Database, shot: "collections" },
];
