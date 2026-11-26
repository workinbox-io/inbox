import * as React from "react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FieldError } from "@/components/ui/field"
import { SettingsSection } from "@/components/app/settings-section"
import { ConfirmButton } from "@/components/app/confirm-button"
import { ClientPasswords } from "./client-passwords"
import { ConnectDevice } from "./connect-device"
import { useSettingsDraft } from "@/components/settings/settings-draft"
import { appLocale, t } from "@/lib/i18n/panel"
interface Mailbox { id:string;address:string;connection:null|{active:number;initialized:number;syncedAt:number|null;error:string|null} }
export function NativeAccounts(){
  const [boxes,setBoxes]=React.useState<Mailbox[]>([]),[configured,setConfigured]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState("")
  const [loading, setLoading] = React.useState(true)
  useSettingsDraft(false, busy)
  const refresh=React.useCallback(async()=>{const result=await api<{configured:boolean;mailboxes:Mailbox[]}>("GET","/api/app/mail/native");setBoxes(result.mailboxes);setConfigured(result.configured);setError("")},[])
  React.useEffect(()=>{void refresh().catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));const timer=setInterval(()=>void refresh().catch(e=>setError((e as Error).message)),10000);return()=>clearInterval(timer)},[refresh])
  async function run(action:()=>Promise<void>){setBusy(true);setError("");try{await action();await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <SettingsSection title={t("Mail apps")} description={t("Read and send your Workinbox mail in Apple Mail, Outlook, Thunderbird or a phone app. Sign in with the mailbox address and a device password.")}>
    <div className="flex flex-col gap-4" aria-busy={busy || loading}>{error&&<FieldError>{error}</FieldError>}
      {!loading && configured && <div><ConnectDevice boxes={boxes} configured={configured} refresh={refresh} /></div>}
      {loading ? <div role="status"><span className="sr-only">{t("Loading mailboxes…")}</span><Skeleton className="h-32 w-full" /></div> : !configured && <p className="text-muted-foreground text-sm">{t("Mail client access is not enabled on the server.")}</p>}
      {!loading && configured && !error && boxes.length === 0 && <p className="text-muted-foreground text-sm">{t("Your Workinbox mailboxes will appear here when they are created.")}</p>}
      {boxes.map(box=><Card key={box.id} className="gap-4 py-5">
        <CardHeader className="px-5">
          <div className="flex flex-wrap items-center gap-2"><CardTitle className="min-w-0 break-all">{box.address}</CardTitle><Badge variant={box.connection?.error ? "danger" : box.connection?.active ? "success" : "secondary"}>{box.connection?.error ? t("Needs attention") : box.connection?.active ? box.connection.initialized ? t("Enabled") : t("Preparing") : t("Not enabled")}</Badge></div>
          <CardDescription role="status">{box.connection?.active ? box.connection.error ?? (box.connection.initialized ? t("Last synchronized: {time}", { time: box.connection.syncedAt ? new Date(box.connection.syncedAt).toLocaleString(appLocale()) : "—" }) : t("Preparing your existing messages for mail apps…")) : t("Enable access to connect a mail app. Your mailbox stays available in Workinbox.")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-wrap gap-2 px-5">
        {box.connection?.active?<>
          {!!box.connection.initialized&&<ClientPasswords connectionId={box.id} source="hosted"/>}
          <ConfirmButton title={t("Disconnect native clients?")} description={t("Device passwords will be revoked. Your mailbox in Workinbox stays available.")} confirmLabel={t("Disconnect")} onConfirm={()=>run(async()=>{await api("DELETE",`/api/app/mail/native/${box.id}`)})}><Button variant="ghost" disabled={busy}>{t("Disconnect")}</Button></ConfirmButton>
        </>:<Button variant="outline" disabled={busy||!configured} onClick={()=>void run(async()=>{await api("POST",`/api/app/mail/native/${box.id}`)})}>{t("Enable mail clients")}</Button>}
        </CardFooter>
      </Card>)}
    </div>
  </SettingsSection>
}
