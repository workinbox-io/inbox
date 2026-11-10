/** Dashboard navigation: the sidebar, and the ⌘K palette's pages and actions. */
import { BookOpen, BookUser, CreditCard, LayoutDashboard, Mail, NotebookPen, PenSquare, Settings, SquarePen } from "lucide-react";

export const APP_NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/mail", label: "Mail", icon: Mail },
  { href: "/app/notes", label: "Notes", icon: NotebookPen },
  { href: "/app/contacts", label: "Contacts", icon: BookUser },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/** Pinned to the bottom of the sidebar. */
export const APP_HELP = [{ href: "/docs", label: "Documentation", icon: BookOpen }];

/** Extra entries in the command palette. */
export const APP_ACTIONS = [
  { href: "/app/mail?compose=1", label: "New e-mail", icon: PenSquare },
  { href: "/app/notes?new=1", label: "New note", icon: SquarePen },
];
