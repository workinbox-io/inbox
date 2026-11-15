import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** A consent link that's expired, tampered with, or opened outside an app's sign-in. */
export function OAuthExpired() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">This link has expired</CardTitle>
        <CardDescription>Start connecting again from the app you were setting up.</CardDescription>
      </CardHeader>
    </Card>
  )
}
