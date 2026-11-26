import { APPS } from "@/config/apps";
import { COMPETITORS } from "@/config/compare";
import { BookOpen, Cloud, Code, HelpCircle, Plug, Server, ShieldCheck, type LucideIcon } from "lucide-react";

/** Header links: optional descriptions, Lucide components or local logo paths. */
export type NavLink = { href: string; label: string; description?: string; icon?: LucideIcon; logo?: string };
export type NavItem =
  | { href: string; label: string }
  | { label: string; items: NavLink[]; footer?: { href: string; label: string }; secondaryFooter?: { href: string; label: string; prefix?: string } };

/**
 * Product identity used by the website, the dashboard and e-mails. `pnpm setup` fills this in;
 * keep `accent` in sync with --primary in styles/brand.css.
 */
export const siteConfig = {
  /** The brand as written in marketing, the app and e-mails (the domain stays workinbox.io). */
  name: "Work Inbox",
  description: "The open-source workspace for your team: email on your own domain, chat, shared notes, calendars, a shared drive and contacts, on Cloudflare.",
  /** The public code, linked from the self-hosting docs and the footer. */
  repoUrl: "https://github.com/workinbox-io/inbox",
  /** Production URL, used for canonical links and the sitemap (astro.config.mjs reads it too). */
  url: "https://workinbox.io",
  supportEmail: "support@workinbox.io",
  accent: "#3555e5",
  /** Top navigation on marketing pages: links, or dropdowns with `items`. */
  navItems: [
    {
      label: "Product",
      items: [
        ...APPS.map((a) => ({ href: `/${a.slug}`, label: a.label, description: a.description, icon: a.icon })),
        { href: "/docs/mcp", label: "AI apps", description: "Claude and ChatGPT work with your mail, notes and files. Mail is only ever drafted.", icon: Plug },
        { href: "/cloudflare-email-routing", label: "For Cloudflare Email Routing", description: "Reply from your domain, not just forward.", icon: Cloud },
        { href: "/self-hosted", label: "Self-hosted email", description: "On your own Cloudflare account, no mail server to run.", icon: Server },
      ],
      footer: { href: "/docs/quickstart", label: "Get started" },
    },
    { href: "/pricing", label: "Pricing" },
    {
      label: "Resources",
      items: [
        { href: "/security", label: "Security", description: "Two-factor authentication and individual access.", icon: ShieldCheck },
        { href: "/docs", label: "Documentation", description: "Get set up and find your way around.", icon: BookOpen },
        { href: "/docs/api", label: "API reference", description: "Connect your tools and build integrations.", icon: Code },
        { href: "/#faq", label: "FAQ", description: "Answers to common questions about the product.", icon: HelpCircle },
      ],
    },
    {
      label: "Compare",
      items: [
        { href: "/google-workspace-alternative", label: "Google Workspace alternative", description: "What you keep, what you give up, what it costs.", logo: "/logos/google-workspace.png" },
        ...COMPETITORS.filter((c) => c.slug !== "google-workspace").map((c) => ({ href: `/vs/${c.slug}`, label: `vs ${c.name}`, logo: c.logo })),
      ],
      footer: { href: "/vs", label: "All comparisons" },
    },
  ] as NavItem[],
  /** Shown on the legal pages and in the footer. */
  legal: {
    company: "Swift Apps Jakub Kałamarz",
    /** Short trading name for the footer copyright. */
    brand: "Swift Apps",
    address: "Kielanówka 16e m. 23, 35-106 Kielanówka, Poland",
    registry: "REGON: 523561765",
    taxId: "NIP: 5170430587",
    email: "legal@workinbox.io",
    /** Country of the company, ISO 3166-1 alpha-2. */
    country: "PL",
    updated: "2026-11-09",
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
