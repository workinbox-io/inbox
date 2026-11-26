import { env } from "cloudflare:workers";
import { db, eq, user } from "@/db";
import { emails } from "@/emails";
import { deliverEmail } from "./email";

/** Tells NOTIFY_EMAIL (you) about a new sign-up and where it came from. */
export async function notifySignup(userId: string) {
  if (!env.NOTIFY_EMAIL) return;
  const [u] = await db.select().from(user).where(eq(user.id, userId));
  if (!u) return;
  const mail = await emails.businessNotice({
    subject: `New sign-up: ${u.email}`,
    heading: "New sign-up.",
    muted: u.name,
    rows: [
      { label: "Email", value: u.email },
      u.signupReferrer ? { label: "Referrer", value: u.signupReferrer } : null,
      u.signupUtmSource ? { label: "Source", value: u.signupUtmSource } : null,
      u.signupUtmCampaign ? { label: "Campaign", value: u.signupUtmCampaign } : null,
      u.signupLandingPath ? { label: "Landing page", value: u.signupLandingPath } : null,
    ],
  });
  await deliverEmail({ to: env.NOTIFY_EMAIL, ...mail });
}
