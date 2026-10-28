import {
  CheckIcon,
  InfoIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** The card every toast sits in. Also used by custom toasts (`toast.custom`) so they match. */
export const toastCard =
  "bg-popover text-popover-foreground flex w-(--width) items-start gap-3 rounded-xl border p-3 pr-4 font-sans shadow-[0_10px_30px_-12px_rgb(0_0_0/0.25),0_2px_6px_-2px_rgb(0_0_0/0.08)]"

const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      gap={10}
      icons={{
        success: <CheckIcon className="size-4" strokeWidth={2.5} />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <XIcon className="size-4" strokeWidth={2.5} />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        duration: 5000,
        ...toastOptions,
        classNames: {
          toast: toastCard,
          icon: "relative bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full",
          content: "flex min-w-0 flex-1 flex-col gap-0.5 pt-1",
          title: "text-sm leading-5 font-medium",
          description: "text-muted-foreground text-[13px] leading-[1.45]",
          actionButton:
            "text-primary hover:bg-primary/10 focus-visible:ring-ring/50 -my-0.5 -mr-1.5 h-8 shrink-0 cursor-pointer self-start rounded-lg px-2.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2",
          cancelButton:
            "text-muted-foreground hover:text-foreground hover:bg-accent h-7 shrink-0 self-center rounded-md px-2 text-xs font-medium transition-colors",
          // The icon sits in a tinted circle; the toast's type picks the tint.
          success: "[&_[data-icon]]:bg-primary/15 [&_[data-icon]]:text-primary",
          error: "[&_[data-icon]]:bg-destructive/12 [&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:bg-amber-500/15 [&_[data-icon]]:text-amber-600 dark:[&_[data-icon]]:text-amber-400",
          info: "[&_[data-icon]]:bg-sky-500/15 [&_[data-icon]]:text-sky-600 dark:[&_[data-icon]]:text-sky-400",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
