/** The public demo's pure rules (server side: lib/server/demo). */
export const DEMO_SLUG = "demo-";
export const isDemoSlug = (slug: string | null | undefined) => !!slug?.startsWith(DEMO_SLUG);
/** Demo people and mailboxes live on `.example` domains, which can never receive real mail. */
export const isDemoAddress = (email: string) => /\.example$/i.test(email.trim().split("@")[1] ?? "");

export const DEMO_REFUSAL = "This isn't available in the demo. Sign up free to use it with your own team.";

/** Writes a demo org's people can't make (non-GET): account, org, billing, keys, devices, imports, public links. */
const BLOCKED = [
  /^\/api\/app\/(account|org|billing|api-keys|connected-apps|team)(\/|$)/,
  // forward-targets mails a verification link to any address; filters can forward.
  /^\/api\/app\/mail\/(native|external-accounts|imap-imports|imports|settings|forward-targets|filters)(\/|$)/,
  /^\/api\/app\/drive\/links(\/|$)/,
  /^\/api\/app\/drive\/items\/[^/]+\/links?(\/|$)/,
  /^\/api\/app\/mentions\/share$/,
  /^\/api\/app\/calendar\/(feed|import)(\/|$)/,
];
export const demoBlocked = (method: string, path: string) => method !== "GET" && method !== "HEAD" && BLOCKED.some((r) => r.test(path));
