import { formatNumber } from "@/lib/format";
import { CURRENCY } from "@/config/plans";

/** Locale-aware formatting for the site and the dashboard; use these instead of a hard-coded "en". */

/** Cents in our billing currency: formatMoney("pl", 1500) → "15,00 €". Whole amounts drop the decimals. */
export function formatMoney(locale: string, cents: number, currency: string = CURRENCY): string {
  const value = cents / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const formatCount = (locale: string, n: number) => formatNumber(n, { locale });

export function formatDate(locale: string, date: Date | number | string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Intl.DateTimeFormat(locale, opts).format(new Date(date));
}

export function formatList(locale: string, items: string[], type: Intl.ListFormatType = "conjunction") {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}
