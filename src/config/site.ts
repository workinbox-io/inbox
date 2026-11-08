import { BookOpen, Code, HelpCircle, LayoutGrid, Plug, Users, type LucideIcon } from "lucide-react";

/** Header links: optional descriptions, Lucide components or local logo paths. */
export type NavLink = { href: string; label: string; description?: string; icon?: LucideIcon; logo?: string };
export type NavItem =
  | { href: string; label: string }
  | { label: string; items: NavLink[]; footer?: { href: string; label: string }; secondaryFooter?: { href: string; label: string; prefix?: string } };

/**
 * Product identity used by the website, the dashboard and e-mails. `pnpm setup` fills this in;
 * keep `accent` in sync with --primary in styles/global.css.
 */
export const siteConfig = {
  name: "Inbox",
  description: "Open-source mail, calendar, contacts and drive for your team, on Cloudflare.",
  /** Production URL, used for canonical links and the sitemap (astro.config.mjs reads it too). */
  url: "https://inbox.app",
  supportEmail: "support@inbox.app",
  accent: "#2f5bff",
  /** Top navigation on marketing pages: links, or dropdowns with `items`. */
  navItems: [
    {
      label: "Product",
      items: [
        { href: "/#features", label: "All features", description: "Explore what you can do with the product.", icon: LayoutGrid },
        { href: "/docs/team", label: "Your team", description: "Invite teammates and manage your workspace.", icon: Users },
        { href: "/docs/mcp", label: "AI apps", description: "Connect your AI assistant to your workspace.", icon: Plug },
      ],
      footer: { href: "/docs/quickstart", label: "Get started" },
    },
    { href: "/pricing", label: "Pricing" },
    {
      label: "Resources",
      items: [
        { href: "/docs", label: "Documentation", description: "Get set up and find your way around.", icon: BookOpen },
        { href: "/docs/api", label: "API reference", description: "Connect your tools and build integrations.", icon: Code },
        { href: "/#faq", label: "FAQ", description: "Answers to common questions about the product.", icon: HelpCircle },
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
    email: "legal@inbox.app",
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
