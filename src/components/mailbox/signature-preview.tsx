/**
 * A signature's HTML (lib/mail/signature.ts, already escaped) as the app shows it everywhere: in the composer under
 * the text and in the settings' previews. It takes the theme's text colour, like the signature in a mail app.
 */
export function SignatureHtml({ html }: { html: string }) {
  return <div className="text-foreground w-fit max-w-full overflow-hidden [&>table]:!mt-0" dangerouslySetInnerHTML={{ __html: html }} />
}
