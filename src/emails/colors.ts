import { siteConfig } from "@/config/site";

/**
 * Hex values for e-mail clients (no CSS variables). Same "ink" palette as the
 * website (styles/brand.css): white page, flat #f7f7f7 tile, orange (Cron) buttons and links.
 */
export const EMAIL_COLORS = {
  light: {
    background: "#ffffff",
    surface: "#f7f7f7",
    inset: "#ffffff",
    foreground: "#1f1f1f",
    mutedForeground: "#808080",
    border: "#e2e2e2",
    primary: siteConfig.accent,
    primaryForeground: "#ffffff",
    accent: siteConfig.accent,
  },
  dark: {
    background: "#262626",
    surface: "#1a1a1a",
    inset: "#262626",
    foreground: "#f5f5f5",
    mutedForeground: "#a1a1a1",
    border: "#383838",
    primary: "#ff5c13",
    primaryForeground: "#ffffff",
    accent: "#ff7d44",
  },
} as const;
