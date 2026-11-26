/** What a demo org (lib/server/demo/seed.ts) may not do: send mail out, touch accounts, billing, keys or public links. */
import { db, eq, organization } from "@/db";
import { HttpError } from "@/lib/server/api";
import { DEMO_REFUSAL, isDemoSlug } from "@/lib/demo";

export { DEMO_REFUSAL, DEMO_SLUG, demoBlocked, isDemoAddress, isDemoSlug } from "@/lib/demo";

const known = new Map<string, boolean>();
export async function isDemoOrg(orgId: string) {
  let demo = known.get(orgId);
  if (demo === undefined) {
    const [org] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, orgId));
    demo = isDemoSlug(org?.slug);
    if (known.size > 5000) known.clear();
    known.set(orgId, demo);
  }
  return demo;
}

export async function refuseInDemo(orgId: string, message = DEMO_REFUSAL) {
  if (await isDemoOrg(orgId)) throw new HttpError(403, message);
}
