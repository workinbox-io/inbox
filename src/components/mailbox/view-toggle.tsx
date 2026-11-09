import { LayoutDashboard, Mail } from "lucide-react"

import { SegmentedControl } from "@/components/ui/segmented-control"

export type MailView = "mail" | "console"

/**
 * Owners and admins switch between mail only (full screen, like members) and mail inside the admin
 * dashboard. `/app/mail?view=…` stores the choice in a cookie and redirects, so this is a full load:
 * the two views use different layouts.
 */
export function MailViewToggle({ view }: { view: MailView }) {
  return (
    <SegmentedControl<MailView>
      size="sm"
      aria-label="View"
      value={view}
      onValueChange={(next) => {
        if (next !== view) location.assign(`/app/mail?view=${next}`)
      }}
      options={[
        { value: "mail", label: <span className="flex items-center gap-1.5"><Mail className="size-3.5" />Mail only</span>, shortLabel: <Mail className="size-3.5" aria-label="Mail only" /> },
        { value: "console", label: <span className="flex items-center gap-1.5"><LayoutDashboard className="size-3.5" />Admin</span>, shortLabel: <LayoutDashboard className="size-3.5" aria-label="Admin" /> },
      ]}
    />
  )
}
