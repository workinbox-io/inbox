import { json, manageHandler } from "@/lib/server/api";
import { createPortal } from "@/lib/server/paddle";

export const POST = manageHandler(async ({ orgId }) => json({ url: await createPortal(orgId) }));
