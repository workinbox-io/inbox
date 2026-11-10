import { cn } from "@/lib/utils"

/**
 * A signature's HTML (lib/mail/signature.ts, already escaped) as the app shows it everywhere: in the composer under
 * the text and in the settings' previews. It takes the theme's text colour, like the signature in a mail app.
 * `framed` sets it apart in a card (settings).
 */
export function SignatureHtml({ html, framed }: { html: string; framed?: boolean }) {
  return (
    <div
      className={cn("text-foreground w-fit max-w-full overflow-hidden [&>table]:!mt-0", framed && "bg-card rounded-lg border px-4 py-3")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
