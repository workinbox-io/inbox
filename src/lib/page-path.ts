/**
 * A page's public path. Prerendered pages are built as files (astro.config `build.format: "file"`), so at build time
 * they see "/pricing.html" and "/index.html"; the site serves them as "/pricing" and "/". Canonicals, og:url and the
 * header's active link must use the served path.
 */
export const pagePath = (pathname: string) => pathname.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "").replace(/(.)\/$/, "$1") || "/";
