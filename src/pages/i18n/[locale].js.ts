/**
 * /i18n/<code>.js: the dashboard's words in one language for the browser (lib/i18n/panel.ts). Prerendered;
 * layouts add `?v=<hash>` of the dictionary, so it is cached and refreshed only when the words change.
 */
import type { APIRoute } from "astro";
import { SITE_LOCALES, isSiteLocale } from "@/lib/i18n/locales";
import { panelDictionary } from "@/lib/server/i18n";

export const prerender = true;

export const getStaticPaths = () => SITE_LOCALES.filter((l) => l !== "en").map((locale) => ({ params: { locale } }));

export const GET: APIRoute = ({ params }) => {
  const locale = params.locale;
  if (!isSiteLocale(locale)) return new Response("Not found", { status: 404 });
  const body = `window.__PANEL_I18N__=${JSON.stringify({ locale, dict: panelDictionary(locale) })};`;
  return new Response(body, { headers: { "content-type": "text/javascript; charset=utf-8" } });
};
