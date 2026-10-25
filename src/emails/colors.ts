import { siteConfig } from "@/config/site";

/**
 * Hex values for e-mail clients (no CSS variables). Same "ink" palette as the
 * website: white page, flat #f6f6f6 tile, brand blue only on buttons and links.
 */
export const EMAIL_COLORS = {
  light: {
    background: "#ffffff",
    surface: "#f6f6f6",
    inset: "#ffffff",
    foreground: "#292929",
    mutedForeground: "#6d6d6d",
    border: "#e2e2e2",
    primary: siteConfig.accent,
    primaryForeground: "#ffffff",
    accent: siteConfig.accent,
  },
  dark: {
    background: "#191919",
    surface: "#212121",
    inset: "#191919",
    foreground: "#ededed",
    mutedForeground: "#a1a1a1",
    border: "#333333",
    primary: siteConfig.accent,
    primaryForeground: "#ffffff",
    accent: "#7d98ff",
  },
} as const;
