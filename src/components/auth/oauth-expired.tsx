import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { t } from "@/lib/i18n/panel"

/** A consent link that's expired, tampered with, or opened outside an app's sign-in. */
export function OAuthExpired() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("This link has expired")}</CardTitle>
        <CardDescription>{t("Start connecting again from the app you were setting up.")}</CardDescription>
      </CardHeader>
    </Card>
  )
}
