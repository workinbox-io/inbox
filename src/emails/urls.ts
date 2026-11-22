import { env } from "cloudflare:workers";

/** Absolute URL on the public app domain (links and images in e-mails). */
export function appUrl(path = "/") {
  return `${(env.PUBLIC_APP_URL ?? "http://localhost:4321").replace(/\/+$/, "")}${path}`;
}
