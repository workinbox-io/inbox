import { ArrowLeft, FileQuestionMark, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconStack } from "@/components/ui/icon-stack"
import { openCommandPalette } from "@/components/workspace/app-commands"
import { t } from "@/lib/i18n/panel"

export function AppNotFound() {
  return <section data-slot="app-not-found" aria-labelledby="not-found-title" className="flex min-h-96 flex-1 flex-col items-center justify-center px-5 py-12 text-center">
    <div aria-hidden className="relative mb-8 flex h-32 w-64 items-center justify-center">
      <span className="text-foreground/5 absolute inset-0 select-none font-mono text-[128px] leading-none tracking-tighter">404</span>
      <IconStack className="mt-7"><FileQuestionMark className="size-5" /></IconStack>
    </div>
    <p className="text-muted-foreground mb-3 font-mono text-xs tracking-widest">404</p>
    <h1 id="not-found-title" className="text-2xl font-medium tracking-tight sm:text-3xl">{t("Page not found")}</h1>
    <p className="text-muted-foreground mt-3 max-w-sm text-sm leading-relaxed">{t("This page may have moved, or you may not have access to it. Use the sidebar or search to find your way back.")}</p>
    <div className="mt-7 flex flex-wrap justify-center gap-3">
      <Button asChild><a href="/app/mail"><ArrowLeft data-icon="inline-start" />{t("Back to mail")}</a></Button>
      <Button variant="outline" onClick={openCommandPalette}><Search data-icon="inline-start" />{t("Search pages")}</Button>
    </div>
  </section>
}
