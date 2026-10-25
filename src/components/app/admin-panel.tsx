import { CreditCard, Eye, UserPlus, Users } from "lucide-react"

import type { AdminOverview } from "@/lib/server/analytics"
import { CURRENCY } from "@/config/plans"
import { BarList } from "@/components/ui/bar-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendChart } from "@/components/ui/trend-chart"
import { KpiRowCard } from "@/components/kpi-row-card"
import { PageHeader } from "@/components/app/page-header"

const shortDay = (v: unknown) => new Date(String(v)).toLocaleDateString(undefined, { month: "short", day: "numeric" })

/** Staff-only overview (ADMIN_EMAILS): revenue, sign-ups and traffic from our own cookieless analytics. */
export function AdminPanel({ data }: { data: AdminOverview }) {
  return (
    <div className="grid gap-6">
      <PageHeader title="Analytics" description="Last 30 days, across all organizations. Only staff see this page." />
      <KpiRowCard
        title="Business"
        metrics={[
          { label: "MRR", value: data.mrr / 100, format: "currency", currency: CURRENCY, icon: <CreditCard /> },
          { label: "Paying organizations", value: data.paying, icon: <Users />, note: `${data.trialing} on trial` },
          { label: "New users", value: data.newUsers, icon: <UserPlus />, trend: data.series.map((d) => d.signups), note: `${data.users} total` },
          { label: "Visitors", value: data.visitors, icon: <Eye />, trend: data.series.map((d) => d.visitors) },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Visitors and sign-ups</CardTitle>
          <CardDescription>Unique visitors a day (cookieless) and new accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={data.series}
            xKey="day"
            xFormatter={shortDay}
            series={[
              { key: "visitors", label: "Visitors" },
              { key: "signups", label: "Sign-ups" },
            ]}
            showLegend
            className="h-64"
          />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={data.topPages} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList data={data.topReferrers} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
