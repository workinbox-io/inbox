import * as React from "react"
import { Bot, Unplug } from "lucide-react"

import type { ConnectedApp } from "@/lib/server/oauth"
import { api } from "@/lib/api-client"
import { siteConfig } from "@/config/site"
import { useLiveData } from "@/lib/use-live-data"
import { timeAgo } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { ConfirmButton } from "@/components/app/confirm-button"
import { CopyField } from "@/components/app/copy-field"
import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/app/settings-section"

type Client = "claude" | "chatgpt" | "claude-code" | "cursor"

const CLIENTS: { value: Client; label: string }[] = [
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude-code", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
]

const slug = siteConfig.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")

function Steps({ client, mcpUrl }: { client: Client; mcpUrl: string }) {
  const steps: Record<Client, React.ReactNode> = {
    claude: (
      <ol className="grid list-decimal gap-1 pl-5">
        <li>In Claude, open Settings → Connectors and choose Add custom connector.</li>
        <li>Name it {siteConfig.name} and paste the server URL.</li>
        <li>Click Connect, sign in here and allow access.</li>
      </ol>
    ),
    chatgpt: (
      <ol className="grid list-decimal gap-1 pl-5">
        <li>In ChatGPT, open Settings → Apps → Advanced settings and turn on developer mode.</li>
        <li>Choose Create app, name it {siteConfig.name}, paste the server URL and pick OAuth.</li>
        <li>Sign in here and allow access.</li>
      </ol>
    ),
    "claude-code": (
      <div className="grid gap-2">
        <p>Run this, then type /mcp in Claude Code to sign in:</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">{`claude mcp add --transport http ${slug} ${mcpUrl}`}</pre>
      </div>
    ),
    cursor: (
      <div className="grid gap-2">
        <p>Add this to ~/.cursor/mcp.json, then sign in from Cursor's MCP settings:</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
          {JSON.stringify({ mcpServers: { [slug]: { url: mcpUrl } } }, null, 2)}
        </pre>
      </div>
    ),
  }
  return <div className="text-muted-foreground text-sm">{steps[client]}</div>
}

export function ConnectAiAppSection({ mcpUrl, upsell }: { mcpUrl: string; upsell: string | null }) {
  const [client, setClient] = React.useState<Client>("claude")
  return (
    <SettingsSection
      title="Connect an AI app"
      description={
        <>
          Ask Claude, ChatGPT or your editor about your data and let them make changes for you. They act as you, in the organization you
          pick.{" "}
          <a className="hover:text-foreground underline underline-offset-2" href="/docs/mcp">
            How it works
          </a>
        </>
      }
    >
      <div className="grid min-w-0 gap-4">
        {upsell ? (
          <p className="bg-muted/60 rounded-xl p-3 text-sm">
            {upsell}{" "}
            <a className="underline underline-offset-2" href="/app/billing">
              See plans
            </a>
          </p>
        ) : null}
        <div className="-mx-1 overflow-x-auto px-1">
          <SegmentedControl size="sm" value={client} onValueChange={setClient} options={CLIENTS} aria-label="AI app" />
        </div>
        <CopyField label="Server URL" value={mcpUrl} />
        <Steps client={client} mcpUrl={mcpUrl} />
        <details className="text-muted-foreground text-xs"><summary className="cursor-pointer">Connecting a script without sign-in?</summary><p className="mt-2">
          Scripts and tools without sign-in can send an organization API key instead:{" "}
          <code className="break-all">Authorization: Bearer sk_…</code>
        </p></details>
      </div>
    </SettingsSection>
  )
}

export function ConnectedAppsPanel(props: { apps: ConnectedApp[] }) {
  const [apps, refresh] = useLiveData("/api/app/connected-apps", props.apps, (json) => (json as { apps: ConnectedApp[] }).apps)
  return (
    <SettingsSection title="Connected apps" description="Apps you allowed to use your account. Disconnecting one cuts its access right away.">
      {apps.length ? (
        <ul className="bg-surface divide-border/60 divide-y rounded-2xl">
          {apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {a.icon ? (
                  <img src={a.icon} alt="" className="size-8 rounded-lg" referrerPolicy="no-referrer" />
                ) : (
                  <span className="bg-background flex size-8 items-center justify-center rounded-lg">
                    <Bot className="text-muted-foreground size-4" />
                  </span>
                )}
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  <span className="text-muted-foreground break-words text-xs">
                    {a.orgName} · connected {timeAgo(a.connectedAt)}
                  </span>
                  <Badge variant={a.scopes.includes("write") ? "info" : "secondary"}>{a.scopes.includes("write") ? "Read and write" : "Read only"}</Badge>
                </div>
              </div>
              <ConfirmButton
                title={`Disconnect ${a.name}?`}
                description="It loses access right away. You can connect it again later."
                confirmLabel="Disconnect"
                onConfirm={async () => {
                  await api("DELETE", `/api/app/connected-apps/${a.id}`)
                  await refresh()
                }}
              >
                <Button size="sm" variant="ghost" className="text-destructive shrink-0">
                  <Unplug />
                  Disconnect
                </Button>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No apps connected yet.</p>
      )}
    </SettingsSection>
  )
}
