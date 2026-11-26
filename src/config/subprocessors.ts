/**
 * Third parties that process personal data for the product. Shown in the privacy policy. Keep in
 * step with what production actually uses.
 */
export interface Subprocessor {
  name: string;
  /** Registered country of the entity. */
  country: string;
  purpose: string;
  /** Transfer safeguard when processing can happen outside the EU/EEA. */
  safeguard?: string;
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Cloudflare, Inc.",
    country: "USA",
    purpose: "Hosting of the website, dashboard, API and database (Workers, D1, R2), and transactional email.",
    safeguard: "EU Standard Contractual Clauses and the EU-US Data Privacy Framework",
  },
];

/** Merchant of record: receives account holders' billing data. */
export const PAYMENT_PROVIDER: Subprocessor = {
  name: "Paddle.com Market Ltd",
  country: "United Kingdom",
  purpose: "Payments, invoices and sales tax as our reseller and merchant of record.",
  safeguard: "UK adequacy decision",
};
