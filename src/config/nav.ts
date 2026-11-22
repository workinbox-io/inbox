/** Panel navigation: the apps' rail, the admin console's and staff sidebars, and the ⌘K palette's pages and actions. */
import { msg } from "@/lib/i18n/panel";
import { BookOpen, BookUser, Building2, CalendarDays, CalendarPlus, ChartLine, CreditCard, Database, FolderPlus, HardDrive, KeyRound, LayoutDashboard, LayoutGrid, Mail, MessagesSquare, MessageSquarePlus, NotebookPen, PenSquare, ScrollText, SquarePen, Users } from "lucide-react";

/** The apps (/app), in rail order. */
export const WORKSPACE_NAV = [
  { href: "/app/mail", label: msg("Mail"), icon: Mail },
  { href: "/app/chat", label: msg("Chat"), icon: MessagesSquare },
  { href: "/app/calendar", label: msg("Calendar"), icon: CalendarDays },
  { href: "/app/notes", label: msg("Notes"), icon: NotebookPen },
  { href: "/app/contacts", label: msg("Contacts"), icon: BookUser },
  { href: "/app/drive", label: msg("Drive"), icon: HardDrive },
  { href: "/app/collections", label: msg("Collections"), icon: Database },
];

/** The admin console (/admin), owners and admins. */
export const ADMIN_NAV = [
  { href: "/admin", label: msg("Overview"), icon: LayoutDashboard },
  { href: "/admin/team", label: msg("Team"), icon: Users },
  { href: "/admin/mail", label: msg("Domains and mailboxes"), icon: Mail },
  { href: "/admin/apps", label: msg("Apps"), icon: LayoutGrid },
  { href: "/admin/billing", label: msg("Billing"), icon: CreditCard },
  { href: "/admin/api-keys", label: msg("API keys"), icon: KeyRound },
  { href: "/admin/audit", label: msg("Audit log"), icon: ScrollText },
  { href: "/admin/organization", label: msg("Organization"), icon: Building2 },
];

/** The platform operator's tools (/staff), ADMIN_EMAILS only. */
export const STAFF_NAV = [
  { href: "/staff", label: msg("Analytics"), icon: ChartLine },
  { href: "/staff/mail", label: msg("Mail"), icon: Mail },
];

/** Pinned to the bottom of the sidebar. */
export const APP_HELP = [{ href: "/docs", label: msg("Documentation"), icon: BookOpen }];

/** Extra entries in the command palette. */
export const APP_ACTIONS = [
  { href: "/app/mail?compose=1", label: msg("New e-mail"), icon: PenSquare },
  { href: "/app/chat", label: msg("New message"), icon: MessageSquarePlus },
  { href: "/app/calendar?new=1", label: msg("New event"), icon: CalendarPlus },
  { href: "/app/notes?new=1", label: msg("New note"), icon: SquarePen },
  { href: "/app/drive?new=folder", label: msg("New drive folder"), icon: FolderPlus },
];
