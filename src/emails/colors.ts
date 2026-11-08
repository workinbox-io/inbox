import { siteConfig } from "@/config/site";

/**
 * Hex values for e-mail clients (no CSS variables). Same "ink" palette as the
 * website (styles/brand.css): white page, flat #f7f7f7 tile, ink buttons and links.
 */
export const EMAIL_COLORS = {
  light: {
    background: "#ffffff",
    surface: "#f7f7f7",
    inset: "#ffffff",
    foreground: "#1a1a1a",
    mutedForeground: "#7c7c7c",
    border: "#e2e2e2",
    primary: siteConfig.accent,
    primaryForeground: "#ffffff",
    accent: siteConfig.accent,
  },
  dark: {
    background: "#141414",
    surface: "#1b1b1b",
    inset: "#141414",
    foreground: "#ececec",
    mutedForeground: "#a1a1a1",
    border: "#333333",
    primary: "#ececec",
    primaryForeground: "#141414",
    accent: "#ececec",
  },
} as const;
