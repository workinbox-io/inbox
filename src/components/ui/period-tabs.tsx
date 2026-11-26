import { SegmentedControl, type SegmentedControlProps } from "@/components/ui/segmented-control"
import { t } from "@/lib/i18n/panel"

export interface PeriodOption {
  value: string
  label: string
}

export const defaultPeriods = (): PeriodOption[] => [
  { value: "week", label: t("Week") },
  { value: "month", label: t("Month") },
  { value: "year", label: t("Year") },
]

export interface PeriodTabsProps extends Omit<SegmentedControlProps<string>, "options" | "size"> {
  options?: PeriodOption[]
  size?: "sm" | "default"
  /** @deprecated The thumb always slides now. Kept so existing callers compile. */
  animated?: boolean
}

/** Small segmented control for switching a chart's time range. */
function PeriodTabs({ options = defaultPeriods(), size = "sm", animated: _animated, ...props }: PeriodTabsProps) {
  return <SegmentedControl options={options} size={size} aria-label={t("Period")} {...props} />
}

export { PeriodTabs }
