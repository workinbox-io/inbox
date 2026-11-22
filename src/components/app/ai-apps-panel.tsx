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
import { t } from "@/lib/i18n/panel"

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
        <li>{t("In Claude, open Settings → Connectors and choose Add custom connector.")}</li>
        <li>{t("Name it {name} and paste the server URL.", { name: siteConfig.name })}</li>
        <li>{t("Click Connect, sign in here and allow access.")}</li>
      </ol>
    ),
    chatgpt: (
      <ol className="grid list-decimal gap-1 pl-5">
        <li>{t("In ChatGPT, open Settings → Apps → Advanced settings and turn on developer mode.")}</li>
        <li>{t("Choose Create app, name it {name}, paste the server URL and pick OAuth.", { name: siteConfig.name })}</li>
        <li>{t("Sign in here and allow access.")}</li>
      </ol>
    ),
    "claude-code": (
      <div className="grid gap-2">
        <p>{t("Run this, then type /mcp in Claude Code to sign in:")}</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">{`claude mcp add --transport http ${slug} ${mcpUrl}`}</pre>
      </div>
    ),
    cursor: (
      <div className="grid gap-2">
        <p>{t("Add this to ~/.cursor/mcp.json, then sign in from Cursor's MCP settings:")}</p>
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
      title={t("Connect an AI app")}
      description={
        <>
          {t("Ask Claude, ChatGPT or your editor about your data and let them make changes for you. They act as you, in the organization you pick.")}{" "}
          <a className="hover:text-foreground underline underline-offset-2" href="/docs/mcp">
            {t("How it works")}
          </a>
        </>
      }
    >
      <div className="grid min-w-0 gap-4">
        {upsell ? (
          <p className="bg-muted/60 rounded-xl p-3 text-sm">
            {upsell}{" "}
            <a className="underline underline-offset-2" href="/admin/billing">
              {t("See plans")}
            </a>
          </p>
        ) : null}
        <div className="overflow-x-auto p-1">
          <SegmentedControl size="sm" value={client} onValueChange={setClient} options={CLIENTS} aria-label={t("AI app")} />
        </div>
        <CopyField label={t("Server URL")} value={mcpUrl} />
        <Steps client={client} mcpUrl={mcpUrl} />
        <details className="text-muted-foreground text-xs"><summary className="cursor-pointer">{t("Connecting a script without sign-in?")}</summary><p className="mt-2">
          {t("Scripts and tools without sign-in can send an organization API key instead:")}{" "}
          <code className="break-all">Authorization: Bearer sk_…</code>
        </p></details>
      </div>
    </SettingsSection>
  )
}

export function ConnectedAppsPanel(props: { apps: ConnectedApp[] }) {
  const [apps, refresh] = useLiveData("/api/app/connected-apps", props.apps, (json) => (json as { apps: ConnectedApp[] }).apps)
  return (
    <SettingsSection title={t("Connected apps")} description={t("Apps you allowed to use your account. Disconnecting one cuts its access right away.")}>
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
                    {t("{org} · connected {when}", { org: a.orgName, when: timeAgo(a.connectedAt) })}
                  </span>
                  <Badge variant={a.scopes.includes("write") ? "info" : "secondary"}>{a.scopes.includes("write") ? t("Read and write") : t("Read only")}</Badge>
                </div>
              </div>
              <ConfirmButton
                title={t("Disconnect {name}?", { name: a.name })}
                description={t("It loses access right away. You can connect it again later.")}
                confirmLabel={t("Disconnect")}
                onConfirm={async () => {
                  await api("DELETE", `/api/app/connected-apps/${a.id}`)
                  await refresh()
                }}
              >
                <Button size="sm" variant="ghost" className="text-destructive shrink-0">
                  <Unplug />
                  {t("Disconnect")}
                </Button>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("No apps connected yet.")}</p>
      )}
    </SettingsSection>
  )
}
