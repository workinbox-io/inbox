/** Dashboard navigation: the sidebar, and the ⌘K palette's pages and actions. */
import { BookOpen, CreditCard, FolderKanban, LayoutDashboard, Plus, Settings } from "lucide-react";

export const APP_NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/projects", label: "Projects", icon: FolderKanban },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/** Pinned to the bottom of the sidebar. */
export const APP_HELP = [{ href: "/docs", label: "Documentation", icon: BookOpen }];

/** Extra entries in the command palette. */
export const APP_ACTIONS = [{ href: "/app/projects?new=1", label: "New project", icon: Plus }];
