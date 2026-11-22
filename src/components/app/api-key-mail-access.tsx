import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@yusufceng1z/ding-react";
import { useSettingsDraft } from "@/components/settings/settings-draft";
import { t } from "@/lib/i18n/panel"
export function ApiKeyMailAccess({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ mailboxes: { id: string; address: string }[]; selected: string[] }>();
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<string[]>([]);
  useSettingsDraft(open && !!data && JSON.stringify([...data.selected].sort()) !== JSON.stringify([...original].sort()), saving);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setData(undefined);
    api<typeof data>("GET", `/api/app/api-keys/${id}/mail`).then(d => { if (active) { setData(d); setOriginal(d?.selected ?? []); } }).catch(e => toast.error(e.message));
    return () => { active = false; };
  }, [open, id]);
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("Mail access")}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>{t("Mail access")}</DialogTitle><DialogDescription>{t("This key can read and send only from selected mailboxes. No selection means no mail access.")}</DialogDescription></DialogHeader>
      {data ? <div className="flex max-h-80 flex-col gap-3 overflow-auto">{data.mailboxes.map(box => <label key={box.id} className="flex items-center gap-2">
        <Checkbox checked={data.selected.includes(box.id)} onCheckedChange={checked => setData({ ...data, selected: checked === true ? [...data.selected, box.id] : data.selected.filter(id => id !== box.id) })} />{box.address}
      </label>)}</div> : <p>{t("Loading…")}</p>}
      <DialogFooter><Button disabled={!data || saving} onClick={async () => {
        setSaving(true);
        try { await api("PUT", `/api/app/api-keys/${id}/mail`, { mailboxIds: data!.selected }); toast.success(t("Mail access saved")); setOpen(false); }
        catch(e) { toast.error((e as Error).message); } finally { setSaving(false); }
      }}>{t("Save access")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
