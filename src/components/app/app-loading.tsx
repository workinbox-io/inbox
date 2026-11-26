import { siteConfig } from "@/config/site"
import { t } from "@/lib/i18n/panel"
import { cn } from "@/lib/utils"

export function AppLoading({ className }: { className?: string }) {
  return <div role="status" className={cn("bg-background grid min-h-64 flex-1 place-items-center p-6", className)}>
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.svg" alt="" width={56} height={56} className="size-14" />
        <span className="text-foreground text-lg font-medium tracking-tight">{siteConfig.name}</span>
      </div>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span aria-hidden="true" className="flex gap-1">
          <span className="bg-current size-1 rounded-full motion-safe:animate-pulse" />
          <span className="bg-current size-1 rounded-full motion-safe:animate-pulse [animation-delay:200ms]" />
          <span className="bg-current size-1 rounded-full motion-safe:animate-pulse [animation-delay:400ms]" />
        </span>
        <span>{t("Loading…")}</span>
      </div>
    </div>
  </div>
}
