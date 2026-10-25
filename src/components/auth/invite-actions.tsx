import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

/** Accept or decline buttons for a signed-in invitee. Accepting also switches to the new org. */
export function InviteActions({ invitationId }: { invitationId: string }) {
  const [pending, setPending] = React.useState<"accept" | "decline" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function act(kind: "accept" | "decline") {
    setPending(kind)
    setError(null)
    const { error } =
      kind === "accept"
        ? await authClient.organization.acceptInvitation({ invitationId })
        : await authClient.organization.rejectInvitation({ invitationId })
    if (error) {
      setPending(null)
      return setError(error.message ?? "Something went wrong")
    }
    window.location.assign("/app")
  }

  return (
    <div className="grid w-full gap-2">
      <Button loading={pending === "accept"} className="w-full" disabled={pending !== null} onClick={() => void act("accept")}>
        {pending === "accept" ? "Joining…" : "Accept invitation"}
      </Button>
      <Button loading={pending === "decline"} variant="ghost" className="text-muted-foreground w-full" disabled={pending !== null} onClick={() => void act("decline")}>
        {pending === "decline" ? "Declining…" : "Decline"}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  )
}
