import * as React from "react"
import { ImagePlus, X } from "lucide-react"
import { toast } from "@yusufceng1z/ding-react"

import { api } from "@/lib/api-client"
import { DEFAULT_COLOR, signaturePreview, type SignatureBrand } from "@/lib/mail/signature"
import { isImageType } from "@/lib/uploads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SignatureHtml } from "./signature-preview"
import { SettingsSection } from "@/components/app/settings-section"
import { uploadWithProgress } from "@/components/uploads/attachments"

const SAMPLE = { signature: "", name: "Anna Kowalska", card: { name: "Anna Kowalska", role: "Head of Support", phone: "+48 600 100 200" } }

/** Settings → Mail → Signature template (owners and admins): what every signature in the org shares. */
export function SignatureTemplate({ initial, onSaved }: { initial: SignatureBrand; onSaved: () => Promise<unknown> }) {
  const [brand, setBrand] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const file = React.useRef<HTMLInputElement>(null)
  const changed = JSON.stringify(brand) !== JSON.stringify(initial)
  const set = (patch: Partial<SignatureBrand>) => setBrand((b) => ({ ...b, ...patch }))

  async function uploadLogo(f: File | undefined) {
    if (!f) return
    if (!isImageType(f.type)) return void toast.error("Use a PNG, JPEG, GIF or WebP image")
    setUploading(true)
    try {
      const up = await uploadWithProgress("/api/app/attachments", {}, f, f.type, () => {}, "Upload failed")
      set({ logoUrl: up.url })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ""
    }
  }
  async function save() {
    setSaving(true)
    try {
      setBrand(await api<SignatureBrand>("POST", "/api/app/mail/settings", { action: "signature.brand", ...brand }))
      toast.success("Signature template saved")
      await onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const preview = signaturePreview(SAMPLE, brand, "anna@" + (brand.website.replace(/^https?:\/\//, "").split("/")[0] || "acme.com"))
  return (
    <SettingsSection
      title="Signature template"
      description="The company, website, logo and colour on everyone's signature. Each person adds their name, role and phone in their own settings."
    >
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="brand-company">Company</Label>
            <Input id="brand-company" value={brand.company} maxLength={100} placeholder="Acme" onChange={(e) => set({ company: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-website">Website</Label>
            <Input id="brand-website" value={brand.website} maxLength={200} placeholder="acme.com" onChange={(e) => set({ website: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-color">Colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="brand-color"
                type="color"
                value={brand.color || DEFAULT_COLOR}
                onChange={(e) => set({ color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <span className="text-muted-foreground font-mono text-xs">{brand.color || "default"}</span>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-2">
              {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="size-9 rounded-md border object-contain" /> : null}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void uploadLogo(e.target.files?.[0])} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => file.current?.click()}>
                <ImagePlus /> {uploading ? "Uploading…" : brand.logoUrl ? "Change" : "Upload"}
              </Button>
              {brand.logoUrl ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove logo" onClick={() => set({ logoUrl: "" })}>
                  <X />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="brand-footer">Footer</Label>
          <Textarea
            id="brand-footer"
            className="min-h-20 text-xs"
            value={brand.footer}
            maxLength={1000}
            placeholder={"Acme sp. z o.o., ul. Prosta 1, 00-001 Warszawa · KRS 0000123456 · NIP 1234567890\nThis message may be confidential. If it reached you by mistake, please tell the sender and delete it."}
            onChange={(e) => set({ footer: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">Small print under everyone's signature: company details, a confidentiality notice.</p>
        </div>
        <div className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Preview with a sample person</span>
          {preview ? <SignatureHtml html={preview} framed /> : null}
        </div>
        <div className="flex justify-end gap-2">
          {changed ? (
            <Button variant="ghost" size="sm" onClick={() => setBrand(initial)}>
              Discard
            </Button>
          ) : null}
          <Button size="sm" onClick={save} loading={saving} disabled={saving || !changed}>
            Save
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
