export type NavItem =
  | { href: string; label: string }
  | { label: string; items: { href: string; label: string }[]; footer?: { href: string; label: string } };

/**
 * Product identity used by the website, the dashboard and e-mails. `pnpm setup` fills this in;
 * keep `accent` in sync with --primary in styles/global.css.
 */
export const siteConfig = {
  name: "Acme",
  description: "The one-line pitch of your product.",
  /** Production URL, used for canonical links and the sitemap (astro.config.mjs reads it too). */
  url: "https://example.com",
  supportEmail: "support@example.com",
  accent: "#2f5bff",
  /** Top navigation on marketing pages: links, or dropdowns with `items`. */
  navItems: [
    { href: "/#features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    {
      label: "Resources",
      items: [
        { href: "/docs", label: "Documentation" },
        { href: "/docs/api", label: "API reference" },
        { href: "/#faq", label: "FAQ" },
      ],
    },
  ] as NavItem[],
  /** Shown on the legal pages and in the footer. */
  legal: {
    company: "Your Company Ltd.",
    /** Short trading name for the footer copyright. */
    brand: "Your Company",
    address: "Street 1, 00-000 City, Country",
    registry: "",
    taxId: "",
    email: "legal@example.com",
    /** Country of the company, ISO 3166-1 alpha-2. */
    country: "PL",
    updated: "2026-10-25",
  },
};

/** schema.org Organization, referenced by `@id` from other JSON-LD on the site. */
export const organizationJsonLd = (url: (path: string) => string) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": url("/#organization"),
  name: siteConfig.name,
  legalName: siteConfig.legal.company,
  url: url("/"),
  logo: url("/apple-touch-icon.png"),
  email: siteConfig.supportEmail,
  address: { "@type": "PostalAddress", addressCountry: siteConfig.legal.country },
  contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: siteConfig.supportEmail },
});
