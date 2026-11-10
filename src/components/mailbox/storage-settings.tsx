import * as React from "react"
import { toast } from "@yusufceng1z/ding-react"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { SettingsSection } from "@/components/app/settings-section"
export function StorageSettings({mailboxes}:{mailboxes:{id:string;address:string}[]}){
  const [usage,setUsage]=React.useState<{mailboxId:string;usedBytes:number;quotaBytes:number}[]>([])
  const refresh=()=>api<{storage:typeof usage}>("GET","/api/app/mail/storage").then(r=>setUsage(r.storage)).catch(e=>toast.error(e.message))
  React.useEffect(()=>{void refresh()},[])
  return <SettingsSection title="Mailbox storage" description="Limits apply to stored messages, originals and attachments. Moving a thread to the trash does not free space."><FieldGroup>{mailboxes.map(box=>{const u=usage.find(u=>u.mailboxId===box.id);return <QuotaRow key={box.id} box={box} usage={u} onSaved={refresh}/>})}</FieldGroup></SettingsSection>
}
function QuotaRow({box,usage,onSaved}:{box:{id:string;address:string};usage?:{usedBytes:number;quotaBytes:number};onSaved:()=>void}){
  const [gib,setGib]=React.useState("10")
  const [busy,setBusy]=React.useState(false)
  React.useEffect(()=>{if(usage)setGib(String(usage.quotaBytes/1024**3))},[usage?.quotaBytes])
  return <Field><FieldLabel htmlFor={`quota-${box.id}`}>{box.address} · {((usage?.usedBytes??0)/1024**3).toFixed(2)} GiB used</FieldLabel><div className="flex items-center gap-2"><Input id={`quota-${box.id}`} type="number" min="0.01" step="0.01" value={gib} onChange={e=>setGib(e.target.value)}/><span className="text-muted-foreground text-sm">GiB</span><Button variant="outline" disabled={busy||!Number(gib)||Number(gib)<=0} onClick={async()=>{setBusy(true);try{await api("POST","/api/app/mail/storage",{mailboxId:box.id,quotaBytes:Math.round(Number(gib)*1024**3)});toast.success("Storage limit updated");onSaved()}catch(e){toast.error((e as Error).message)}finally{setBusy(false)}}}>Save</Button></div></Field>
}
