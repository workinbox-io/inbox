import { CalendarDays, Contact, Database, HardDrive, Mail, MessagesSquare, NotebookPen, type LucideIcon } from "lucide-react";
import { msg } from "@/lib/i18n/panel";

/** The workspace's apps, each with its marketing page (pages/<slug>.astro), in the order the site shows them. */
export type AppInfo = { slug: string; label: string; description: string; icon: LucideIcon; shot: string };

export const APPS: AppInfo[] = [
  { slug: "custom-domain-email", label: msg("Mail"), description: "Personal and shared mailboxes on your domain, with drafts your team sees.", icon: Mail, shot: "mail-thread" },
  { slug: "team-chat", label: msg("Chat"), description: "Channels, DMs and threads, with files and mentions from the rest of the workspace.", icon: MessagesSquare, shot: "chat" },
  { slug: "shared-notes", label: msg("Notes"), description: "Notes the team writes together, live.", icon: NotebookPen, shot: "notes" },
  { slug: "team-calendar", label: msg("Calendar"), description: "Your week next to your colleagues', with invitations and time zones.", icon: CalendarDays, shot: "calendar" },
  { slug: "shared-drive", label: msg("Drive"), description: "Folders and files shared with people or the team.", icon: HardDrive, shot: "drive" },
  { slug: "shared-contacts", label: msg("Contacts"), description: "One address book for the team, filled from your mail.", icon: Contact, shot: "contacts" },
  { slug: "custom-apps", label: msg("Collections"), description: "Your own lists: deals, tasks, equipment, as a list, board or timeline.", icon: Database, shot: "collections" },
];
